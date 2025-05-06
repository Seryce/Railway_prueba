
# Standard Library
import json
import time
import warnings
from typing import Optional, Dict
from fastapi import Request

# Third-Party Libraries
import torch
import numpy as np
import shap

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from transformers import AutoTokenizer  
from transformers import pipeline
from modelo_xlmroberta import TriageRoberta
from torch.nn.functional import softmax

# ===============================
# 🚀 INICIALIZACIÓN FASTAPI
# ===============================

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

CLAVE_SECRETA = "vvv"
pacientes_registrados = {}

# ===============================
# 🤖 CARGA DEL MODELO
# ===============================
import os
import requests

def descargar_modelo():
    model_path = "triage_xlmroberta_weights.pth"
    if not os.path.exists(model_path):
        print("Descargando modelo desde Google Drive...")
        file_id = "1TxMfYZKwUx5_SG9gHzYOdjKCavREwyQg"
        url = f"https://drive.google.com/uc?export=download&id={file_id}"
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            with open(model_path, "wb") as f:
                f.write(response.content)
            print("Modelo descargado correctamente.")
        else:
            print("Error al descargar el modelo:", response.status_code)

descargar_modelo()


# Configuración del dispositivo
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

tokenizer = AutoTokenizer.from_pretrained("tokenizer_xlm_roberta")
MAX_LEN = 128

# Cargar modelo al iniciar
@app.on_event("startup")
def cargar_modelo():
    global model
    model = TriageRoberta(class_weights=None)  # usar la misma firma que el entrenamiento
    model.load_state_dict(torch.load("triage_xlmroberta_weights.pth", map_location=device), strict=False)
    model.to(device)
    model.eval()

# ===============================
# 📊 CONFIGURACIONES Y DATOS
# ===============================

prioridades_dict = {
    1: "🔴 Prioridad 1 - Atención INMEDIATA",
    2: "🟠 Prioridad 2 - Atención MUY URGENTE",
    3: "🟡 Prioridad 3 - Atención URGENTE",
    4: "🟢 Prioridad 4 - Atención MENOS URGENTE",
    5: "🔵 Prioridad 5 - Atención NO URGENTE"
}

with open("preguntas_triaje.json", "r", encoding="utf-8") as f:
    preguntas_por_categoria = json.load(f)

# ===============================
# 🧬 MODELO DE DATOS
# ===============================

class Paciente(BaseModel):
    nombre: str
    edad: int
    temp: float
    pas: float
    pad: float
    frecuencia_cardiaca: float
    oxigeno: float
    descripcion: str = ""
    categoria: Optional[str] = None
    respuestas: Dict[str, str] = {}
    prioridad_asignada: Optional[int] = None  

# ===============================
# 🩺 RANGOS Y MÁRGENES
# ===============================

# Diccionario con los rangos de constantes vitales según la edad
rangos_prioridad_1 = {
    "0":    {"fc": (80, 200), "pas": (55, 90),  "pad": (30, 60),  "oxigeno": 85, "temp": (34.0, 40.5)},  # Recién nacidos (0-28 días)
    "1-2":  {"fc": (80, 200), "pas": (60, 100), "pad": (35, 65),  "oxigeno": 88, "temp": (34.0, 40.5)},  # Lactantes (1-2 años)
    "3-5":  {"fc": (75, 190), "pas": (65, 105), "pad": (40, 70),  "oxigeno": 88, "temp": (34.0, 40.5)},  # Preescolares (3-5 años)
    "6-12": {"fc": (60, 180), "pas": (70, 115), "pad": (45, 80),  "oxigeno": 88, "temp": (34.0, 40.5)},  # Escolares (6-12 años)
    "13-18":{"fc": (50, 170), "pas": (75, 120), "pad": (50, 85),  "oxigeno": 88, "temp": (34.0, 40.5)},  # Adolescentes (13-18 años)
    "18+":  {"fc": (40, 160), "pas": (80, 220), "pad": (50, 130), "oxigeno": 88, "temp": (34.0, 40.5)}   # Adultos (18+)
}

# Margen de error para las mediciones
margen_error = {
    "pas": 5,
    "pad": 5,
    "fc": 3,
    "oxigeno": 1,
    "temp": 0.2
}

# ===============================
# 📍 ENDPOINTS API
# ===============================
@app.get("/categorias")
def obtener_categorias():
    return list(preguntas_por_categoria.keys())

@app.get("/preguntas/{categoria}")
def obtener_preguntas(categoria: str):
    return preguntas_por_categoria.get(categoria, [])

# ===============================
# 🤖🤖🤖 IA
# ===============================
def predecir_prioridad(texto):
    inputs = tokenizer(texto, padding="max_length", truncation=True, max_length=128, return_tensors="pt")
    input_ids = inputs["input_ids"].to(device)
    attention_mask = inputs["attention_mask"].to(device)
    with torch.no_grad():
        outputs = model(input_ids, attention_mask)
        logits = outputs["logits"]
        probs = softmax(logits, dim=1).cpu().numpy()[0]
        pred = int(np.argmax(probs))
        confianza = float(np.max(probs))
    return pred + 1, confianza, probs

# ===============================
# 📍📍📍 TRIAJE
# ===============================
@app.post("/triaje")
def evaluar_triaje(paciente: Paciente):

    descripcion = paciente.descripcion or ""
    if not isinstance(descripcion, str):
        descripcion = ""

    # Validación de campos
    errores = []

    if not paciente.nombre or not isinstance(paciente.nombre, str):
        errores.append("Nombre inválido")

    if paciente.edad <= 0 or paciente.edad > 120:
        errores.append("Edad fuera de rango")

    if paciente.temp < 30 or paciente.temp > 45:
        errores.append("Temperatura no válida")

    if not (40 <= paciente.pas <= 250 and 30 <= paciente.pad <= 200):
        errores.append("Presión arterial fuera de rango")

    if not (30 <= paciente.frecuencia_cardiaca <= 220):
        errores.append("Frecuencia cardíaca anormal")

    if not (50 <= paciente.oxigeno <= 100):
        errores.append("Nivel de oxígeno fuera de rango")

    if errores:
        raise HTTPException(status_code=422, detail=errores)

    prioridad_asignada = 5  # Menos urgente por defecto

    # 🔹 Determinar los valores normales según la edad del paciente
    edades = ["0", "1-2", "3-5", "6-12", "13-18", "18+"]
    claves_edades = [0, 2, 5, 12, 18, float('inf')]
    limites = rangos_prioridad_1.get(next(r for r, edad in zip(edades, claves_edades) if paciente.edad <= edad))

    if not limites:
        raise ValueError("No se encontraron límites adecuados para la edad proporcionada.")

    # 🔹 Evaluación de Prioridad 1 (Emergencia)
    if (
        paciente.prioridad_asignada == 1 or
        paciente.pas < limites["pas"][0] - margen_error["pas"] or paciente.pad < limites["pad"][0] - margen_error["pad"] or
        paciente.pad > limites["pad"][1] + margen_error["pad"] or
        not (limites["fc"][0] - margen_error["fc"] <= paciente.frecuencia_cardiaca <= limites["fc"][1] + margen_error["fc"]) or
        paciente.oxigeno < limites["oxigeno"] - margen_error["oxigeno"] or
        not (limites["temp"][0] - margen_error["temp"] <= paciente.temp <= limites["temp"][1] + margen_error["temp"])
    ):
        prioridad_asignada = 1  # 🚨 Emergencia inmediata
        detener = True
        paciente.categoria = paciente.categoria or "Constantes alteradas"

    else:
        detener = False
        # 🔹 Evaluación de Prioridad 2 (Urgencia grave)
        if (
            paciente.pas <= limites["pas"][0] + 10 + margen_error["pas"] or paciente.pad <= 65 + margen_error["pad"] or
            not (limites["fc"][0] + 10 - margen_error["fc"] <= paciente.frecuencia_cardiaca <= limites["fc"][1] - 10 + margen_error["fc"]) or
            paciente.oxigeno < limites["oxigeno"] + 2 - margen_error["oxigeno"]
        ):
            prioridad_asignada = 2  # ⚠️ Urgencia grave

    # Evaluación según respuestas del usuario
    if paciente.categoria in preguntas_por_categoria:
        for pregunta in preguntas_por_categoria[paciente.categoria]:
            if paciente.respuestas.get(pregunta["clave"], "").lower() in ["sí", "si"]:
                prioridad_asignada = min(prioridad_asignada, pregunta["prioridad"])
                    
    # **Extraer las preguntas respondidas con "Sí" correctamente**
    preguntas_respondidas = [
        pregunta["pregunta"]
        for pregunta in preguntas_por_categoria.get(paciente.categoria, [])
        if paciente.respuestas.get(pregunta["clave"], "").strip().lower() in ["si", "sí"]
    ]

    # **Si no hay respuestas "Sí", evitar que aparezca como "Ninguna" en el frontend**
    if not preguntas_respondidas:
        preguntas_respondidas = []  # Enviar una lista vacía en lugar de "Ninguna"

    
    # **Clave única basada en nombre y edad**
    clave_paciente = f"{paciente.nombre}_{paciente.edad}"

    # IA aquí
    pred, confianza, probs = predecir_prioridad(descripcion)

    # ✅ Guardar todo junto
    pacientes_registrados[clave_paciente] = {
        "nombre": paciente.nombre,
        "edad": paciente.edad,
        "prioridad": prioridades_dict[prioridad_asignada],
        "prioridad_ia": int(pred),
        "prioridad_ia_str": f"Prioridad {int(pred)}",
        "probabilidades_ia": dict(zip(["1", "2", "3", "4", "5"], map(float, probs))),
        "categoria": paciente.categoria or "Constantes alteradas",
        "preguntas_si": preguntas_respondidas,
        "temperatura": paciente.temp,
        "presion_arterial": f"{paciente.pas}/{paciente.pad}",
        "frecuencia_cardiaca": paciente.frecuencia_cardiaca,
        "oxigeno": paciente.oxigeno,
        "descripcion": paciente.descripcion,
        "timestamp": int(time.time()),

    }
    return {
        "prioridad": prioridades_dict[prioridad_asignada],
        "prioridad_ia": prioridades_dict[pred],
        "detener": detener
    }

@app.get("/pacientes")
def obtener_pacientes():
    pacientes_serializables = []
    for clave, paciente in pacientes_registrados.items():
        try:
            pacientes_serializables.append(jsonable_encoder(paciente))
        except Exception as e:
            print(f"Error al serializar paciente {clave}: {e}")
    return {"pacientes": pacientes_serializables}

@app.delete("/pacientes")
def borrar_pacientes(x_api_key: str = Header(...)):
    if x_api_key != CLAVE_SECRETA:
        raise HTTPException(status_code=403, detail="Clave no válida")
    pacientes_registrados.clear()
    return {"mensaje": "Todos los pacientes han sido eliminados"}

# ===============================
# 🖥️ RUTAS HTML (Frontend)
# ===============================

@app.get("/", response_class=HTMLResponse)
def render_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/enfermero", response_class=HTMLResponse)
def render_enfermero(request: Request):
    return templates.TemplateResponse("enfermero.html", {"request": request})

# ===============================
# 📊 EXPLICABILIDAD SHAP
# ===============================

class TextoEntrada(BaseModel):
    descripcion: str
    
@app.post("/explicar")
async def explicar_texto(data: TextoEntrada):
    texto = data.descripcion

    encoded = tokenizer(
        texto,
        truncation=True,
        padding='max_length',
        max_length=128,
        return_tensors="pt"
    )
    input_ids = encoded["input_ids"].to(device)
    attention_mask = encoded["attention_mask"].to(device)

    input_ids_np = input_ids.cpu().numpy()

    def f(x):
        input_ids_tensor = torch.tensor(np.array(x), dtype=torch.long).to(device)
        attention_mask_tensor = (input_ids_tensor != tokenizer.pad_token_id).long()
        with torch.no_grad():
            logits = model(input_ids_tensor, attention_mask_tensor)["logits"]
        return torch.softmax(logits, dim=1).cpu().numpy()

    explainer = shap.Explainer(f, input_ids_np, algorithm="permutation")
    shap_values = explainer(input_ids_np)

    probs = f(input_ids_np)[0]
    pred_class = int(np.argmax(probs))

    token_ids = input_ids_np[0]
    tokens = tokenizer.convert_ids_to_tokens(token_ids)
    scores = shap_values[0].values[:, pred_class]

    clean_tokens = [t.replace('▁', ' ') if '▁' in t else t for t in tokens]

    importancia_tokens = [
        {"token": tok, "shap": round(float(val), 4)}
        for tok, val in zip(clean_tokens, scores)
        if tok not in tokenizer.all_special_tokens
    ]

    return {
        "descripcion": texto,
        "prediccion": pred_class + 1,
        "shap_texto": importancia_tokens
    }
