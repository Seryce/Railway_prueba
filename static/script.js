
let datosPaciente = {};
let preguntas = [];
let indicePregunta = 0;
let prioridadAsignada = null;

function limpiarErrores() {
    document.querySelectorAll(".error-mensaje").forEach(el => el.innerText = "");
}

function irASiguientePaso() {
    limpiarErrores();
    let error = false;

    const nombre = document.getElementById("nombre").value.trim();
    const edad = Number(document.getElementById("edad").value);

    if (!nombre) {
        document.getElementById("error-nombre").innerText = "El nombre es obligatorio";
        error = true;
    }
    if (isNaN(edad) || edad <= 0 || edad > 120) {
        document.getElementById("error-edad").innerText = "La edad debe estar entre 1 y 120";
        error = true;
    }

    if (error) return;

    document.getElementById("formPaso1").style.display = "none";
    document.getElementById("formPaso2").style.display = "block";
}

async function validarFormulario() {
    const boton = document.getElementById("botonContinuar");
    boton.disabled = true;
    boton.innerText = "Procesando...";

    datosPaciente = {
        nombre: document.getElementById("nombre").value.trim(),
        edad: Number(document.getElementById("edad").value),
        temp: Number(document.getElementById("temp").value),
        pas: Number(document.getElementById("pas").value),
        pad: Number(document.getElementById("pad").value),
        frecuencia_cardiaca: Number(document.getElementById("frecuencia_cardiaca").value),
        oxigeno: Number(document.getElementById("oxigeno").value),
        descripcion: document.getElementById("descripcion")?.value.trim() || "",
        categoria: null,
        respuestas: {},
    };

    limpiarErrores(); // Borra errores previos

    let error = false;
    
    // Nombre vacío
    if (!datosPaciente.nombre.trim()) {
        document.getElementById("error-nombre").innerText = "El nombre es obligatorio";
        error = true;
    }
    
    // Edad fuera de rango
    if (isNaN(datosPaciente.edad) || datosPaciente.edad < 0 || datosPaciente.edad > 120) {
        document.getElementById("error-edad").innerText = "La edad debe estar entre 0 y 120 años";
        error = true;
    }

    const camposNumericos = ["temp", "pas", "pad", "frecuencia_cardiaca", "oxigeno"];
    // Vitales inválidos localmente (antes de backend)
    camposNumericos.forEach(campo => {
    const valor = datosPaciente[campo];
        if (isNaN(valor) || valor <= 0) {
            const errorEl = document.getElementById(`error-${campo}`);
            if (errorEl) {
                errorEl.innerText = "Campo obligatorio o valor inválido";
            }
            error = true;
        }
    });
    
    if (error) {
        boton.disabled = false;
        boton.innerText = "Continuar";
        return;
    }
    
    try {
        const response = await fetch(`/triaje`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datosPaciente)
        });
    
        if (!response.ok) {
            const errorData = await response.json();
            const errores = errorData.detail || [];
    
            limpiarErrores(); // Limpia errores anteriores
    
            errores.forEach(mensaje => {
                const texto = mensaje.toLowerCase();
                if (texto.includes("temperatura")) {
                    document.getElementById("error-temp").innerText = mensaje;
                } else if (texto.includes("frecuencia")) {
                    document.getElementById("error-frecuencia_cardiaca").innerText = mensaje;
                } else if (texto.includes("presión") || texto.includes("presion")) {
                    document.getElementById("error-pas").innerText = mensaje;
                    document.getElementById("error-pad").innerText = mensaje;
                } else if (texto.includes("oxígeno") || texto.includes("oxigeno")) {
                    document.getElementById("error-oxigeno").innerText = mensaje;
                }
            });
    
            return; // Detener el flujo
        }
    
        const result = await response.json();
    
        if (result.detener) {
            document.getElementById("formularioPaciente").style.display = "none";
            document.getElementById("resultadoFinal").style.display = "block";
            mostrarResultado(result.prioridad);
        } else {
            document.getElementById("formularioPaciente").style.display = "none";
            document.getElementById("seleccionCategoria").style.display = "block";
            await cargarCategorias();
        }

    } catch (error) {
        alert("Error en la comunicación con el servidor.");
    } finally {
        boton.disabled = false;
        boton.innerText = "Continuar";
    }
}

async function cargarCategorias() {
    try {
        const response = await fetch("/categorias");
        const categorias = await response.json();

        const contenedor = document.getElementById("botonesCategoria");
        contenedor.innerHTML = "";

        categorias.forEach(cat => {
            const boton = document.createElement("button");
            boton.innerText = cat;
            boton.onclick = () => seleccionarCategoria(cat);
            contenedor.appendChild(boton);
        });

    } catch (error) {
        console.error("Error al cargar categorías:", error);
        document.getElementById("botonesCategoria").innerHTML = "<p>❌ No se pudieron cargar las categorías</p>";
    }
}

function seleccionarCategoria(categoria) {
    datosPaciente.categoria = categoria;
    document.getElementById("seleccionCategoria").style.display = "none";
    iniciarPreguntas(categoria);
}

async function iniciarPreguntas(categoria) {
    try {
        const response = await fetch(`/preguntas/${encodeURIComponent(categoria)}`);
        preguntas = await response.json();
        preguntas = preguntas.sort((a, b) => a.prioridad - b.prioridad);

        indicePregunta = 0;
        document.getElementById("preguntasTriaje").style.display = "block";
        mostrarPregunta();

    } catch (error) {
        console.error("Error al cargar preguntas:", error);
        document.getElementById("formPreguntas").innerHTML = "<p>Error al cargar preguntas.</p>";
    }
}

function mostrarPregunta() {
    const contenedor = document.getElementById("formPreguntas");
    contenedor.innerHTML = "";

    if (indicePregunta < preguntas.length) {
        const p = preguntas[indicePregunta];

        contenedor.innerHTML = `
            <div id="preguntaActual">${p.pregunta}</div>
            <div class="botones-respuesta">
                <button class="boton-si" onclick="respuesta('sí')">Sí</button>
                <button class="boton-no" onclick="respuesta('no')">No</button>
            </div>
        `;
    } else {
        enviarRespuestas();  // Si no dijo sí a ninguna
    }
}

function respuesta(valor) {
    const clave = preguntas[indicePregunta].clave;
    datosPaciente.respuestas[clave] = valor;

    indicePregunta++;  

    if (valor === "sí" || indicePregunta >= preguntas.length) {
        mostrarPregunta();  
        enviarRespuestas();
    } else {
        mostrarPregunta();
    }
}

async function enviarRespuestas() {
    try {
        const response = await fetch("/triaje", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datosPaciente)
        });

        const resultText = await response.text();

        if (!response.ok) {
            try {
                const jsonError = JSON.parse(resultText);
                alert("❌ Error del servidor: " + (jsonError.detail || "Error desconocido"));
            } catch (e) {
                alert("❌ Error inesperado del servidor:\n" + resultText);
            }
            return;
        }

        const result = JSON.parse(resultText);
        document.getElementById("preguntasTriaje").style.display = "none";
        document.getElementById("resultadoFinal").style.display = "block";
        mostrarResultado();

    } catch (error) {
        alert("❌ Error al enviar respuestas al servidor.");
        console.error(error);
    }
}

function mostrarResultado() {
    const resultado = document.getElementById("resultado");
    resultado.innerText = "✅ Se ha realizado correctamente el triaje.";
}


function reiniciarTriaje() {
    document.getElementById("resultadoFinal").style.display = "none";
    document.getElementById("seleccionCategoria").style.display = "none";
    document.getElementById("preguntasTriaje").style.display = "none";
    document.getElementById("formularioPaciente").style.display = "block";
    document.getElementById("formPaso1").style.display = "block";
    document.getElementById("formPaso2").style.display = "none";
    document.getElementById("triajeForm").reset();
    document.getElementById("resultado").innerText = "";

    preguntas = [];
    prioridadAsignada = null;
    datosPaciente = {};

    window.scrollTo({ top: 0, behavior: "smooth" });
}

