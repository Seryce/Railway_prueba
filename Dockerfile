# Imagen base liviana de Python
FROM python:3.10-slim

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de la app
COPY . /app/

# Copiar explícitamente el modelo, incluso si está en .gitignore
COPY triage_xlmroberta_weights.pth /app/

# Copiar tokenizer (guardado previamente)
COPY tokenizer_xlm_roberta/ /app/tokenizer_xlm_roberta/

# Instalar librerías del sistema necesarias
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        build-essential \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Actualizar pip
RUN pip install --upgrade pip

# Instalar dependencias del proyecto
RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

# Exponer el puerto que usará Uvicorn
EXPOSE 8000

# Comando de inicio
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

