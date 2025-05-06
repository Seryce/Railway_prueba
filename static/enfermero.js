// Cargar pacientes desde la API

const colorMapa = {
    "🔴": "red",
    "🟠": "orange",
    "🟡": "yellow",
    "🟢": "green",
    "🔵": "blue"
};

async function cargarPacientes() {
    try {
        const response = await fetch("/pacientes");
        if (!response.ok) throw new Error("Error en la respuesta del servidor");

        const data = await response.json();
        const listaPacientes = document.getElementById("listaPacientes");

        // Limpiar antes de mostrar
        listaPacientes.innerHTML = "";

        if (!data.pacientes || data.pacientes.length === 0) {
            listaPacientes.innerHTML = "<p>No hay pacientes en este momento.</p>";
            return;
        }

        // Ordenar por prioridad
        data.pacientes.sort((a, b) => {
            const pa = parseInt(a.prioridad.match(/\d+/)?.[0] || "5");
            const pb = parseInt(b.prioridad.match(/\d+/)?.[0] || "5");
            return pa - pb;
        });
        
        data.pacientes.forEach(paciente => {
            const card = crearTarjetaPaciente(paciente);
            listaPacientes.appendChild(card);
        });        

    } catch (error) {
        console.error("Error cargando pacientes:", error);
        document.getElementById("listaPacientes").innerHTML = "<p>Error al cargar pacientes. Intenta más tarde.</p>";
    }
}

function crearTarjetaPaciente(paciente) {
    const divPaciente = document.createElement("div");
    divPaciente.classList.add("paciente-card");

    // Animación suave
    divPaciente.style.animationDelay = `${Math.random() * 0.3}s`;

    const prioridadManual = parseInt(paciente.prioridad?.match(/\d+/)?.[0] || "5");
    divPaciente.dataset.prioridad = prioridadManual;

    const tiempoActual = Math.floor(Date.now() / 1000);
    const segundosEnSistema = tiempoActual - (paciente.timestamp || tiempoActual);
    const minutos = Math.floor(segundosEnSistema / 60);
    const segundos = segundosEnSistema % 60;
    const tiempoFormateado = `${minutos}m ${segundos}s`;

    const prioridadEmoji = paciente.prioridad.split(" ")[0];
    const colorBorde = colorMapa[prioridadEmoji] || "blue";
    divPaciente.classList.add(`borde-${colorBorde}`, `fondo-prioridad-${paciente.prioridad_ia}`);

    divPaciente.dataset.prioridad = prioridadManual;

    const prioridadIA = parseInt(paciente.prioridad_ia ?? "0");
    // Detectar discrepancia
    const hayDiscrepancia = prioridadIA !== prioridadManual;

    divPaciente.innerHTML = `
        <h2>${paciente.nombre}, ${paciente.edad} años</h2>
        <p><strong>Prioridad:</strong> ${paciente.prioridad}</p>
        <p><strong>Prioridad IA:</strong> ${prioridadIA ? `Prioridad ${prioridadIA}${hayDiscrepancia ? ' ⚠️' : ''}` : "No disponible"}</p>
        <p><strong>⏱️ Tiempo en espera:</strong> ${tiempoFormateado}</p>
        <button class="boton-toggle">▶ Ver detalles</button>
        <div class="detalles-paciente" style="display: none;">
            <p><strong>Categoría:</strong> ${paciente.categoria}</p>
            <p><strong>Descripción:</strong> ${paciente.descripcion}</p>
            ${
                paciente.preguntas_si?.length > 0
                    ? `<p><strong>Preguntas con "Sí":</strong> ${paciente.preguntas_si.join(", ")}</p>`
                    : ""
            }
            ${
                paciente.probabilidades_ia
                    ? `<div><strong>Probabilidades IA:</strong><ul>` +
                    Object.entries(paciente.probabilidades_ia)
                        .map(([p, prob]) => `<li>${p}: ${(parseFloat(prob) * 100).toFixed(2)}%</li>`)
                        .join("") +
                    `</ul></div>`
                    : ""
            }
            <div class="datos-medicos">
                <p><strong>Temperatura:</strong> ${paciente.temperatura}°C</p>
                <p><strong>Presión Arterial:</strong> ${paciente.presion_arterial}</p>
                <p><strong>Frecuencia Cardíaca:</strong> ${paciente.frecuencia_cardiaca} bpm</p>
                <p><strong>Oxígeno:</strong> ${paciente.oxigeno}%</p>
            </div>
        </div>
    `;

    // Toggle detalles
    const toggleBtn = divPaciente.querySelector(".boton-toggle");
    const detallesDiv = divPaciente.querySelector(".detalles-paciente");
    toggleBtn.addEventListener("click", () => {
        const visible = detallesDiv.style.display === "block";
        detallesDiv.style.display = visible ? "none" : "block";
        toggleBtn.innerText = visible ? "▶ Ver detalles" : "🔽 Ocultar detalles";
    });

    // Botón SHAP
    const boton = document.createElement("button");
    boton.innerText = "🧠 Ver Explicación IA";
    boton.addEventListener("click", async () => {
        boton.disabled = true;
        boton.innerText = "Cargando...";
        try {
            const res = await fetch(`/explicar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ descripcion: paciente.descripcion || "" })
            });
            if (!res.ok) throw new Error("Error al llamar a /explicar");
            const data = await res.json();
            paciente.shap = data;
            renderExplicacionIA(divPaciente, data);
        } catch (err) {
            alert("No se pudo obtener la explicación IA.");
        } finally {
            boton.disabled = false;
            boton.innerText = "🧠 Ver Explicación IA";
        }
    });
    divPaciente.appendChild(boton);

    if (paciente.shap) renderExplicacionIA(divPaciente, paciente.shap);

    return divPaciente;
}

// DOM ready
document.addEventListener("DOMContentLoaded", cargarPacientes);
setInterval(cargarPacientes, 15000);


// Refrescar la lista manualmente
function actualizarPacientes() {
    cargarPacientes(); // Vuelve a cargar desde la API
}

// Borrar totalmente (como reiniciar a cero)
async function borrarTodosLosPacientes() {
    try {
        const response = await fetch("/pacientes", {
            method: "DELETE",
            headers: {
                "X-API-Key": "vvv" // 👈 tu clave aquí
            }
        });

        if (!response.ok) throw new Error("No se pudo eliminar en el backend");

        document.getElementById("listaPacientes").innerHTML = "<p>✅ Todos los pacientes han sido eliminados del sistema.</p>";

    } catch (error) {
        console.error("Error al eliminar pacientes:", error);
        document.getElementById("listaPacientes").innerHTML = "<p>❌ Error al eliminar pacientes.</p>";
    }
}

function confirmarBorrado() {
    const confirmacion = confirm("⚠️ ¿Estás seguro de que quieres borrar TODOS los pacientes del sistema?");
    if (confirmacion) {
        borrarTodosLosPacientes(); // 👉 Solo borra si el usuario dice que sí
    }
}

function filtrarPacientes() {
    const input = document.getElementById("busquedaNombre").value.toLowerCase();
    document.querySelectorAll(".paciente-card").forEach(card => {
        const nombre = card.querySelector("h2").innerText.toLowerCase();
        card.style.display = nombre.includes(input) ? "block" : "none";
    });
}

function filtrarPorPrioridad(nivel) {
    document.querySelectorAll(".paciente-card").forEach(card => {
        const prioridad = parseInt(card.dataset.prioridad);

        if (nivel === 0 || prioridad === nivel) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });
}

function renderExplicacionIA(divPaciente, shapData) {
    const viejo = divPaciente.querySelector(".explicacion-shap");
    if (viejo) viejo.remove();

    const contenedor = document.createElement("div");
    contenedor.classList.add("explicacion-shap");

    contenedor.innerHTML = `<h4>🧠 Palabras que influyeron:</h4>`;

    const tokensDiv = document.createElement("div");
    tokensDiv.classList.add("shap-container");  // ✅ AQUI va la clase correcta

    shapData.shap_texto
        .filter(({ token }) => token.trim().length > 1)
        .forEach(({ token, shap }) => {
            const span = document.createElement("span");
            span.textContent = token.replace("▁", "").trim();
            span.className = "shap-token";

            if (shap > 0) span.classList.add("positivo");
            else span.classList.add("negativo");

            span.title = `SHAP: ${shap.toFixed(3)}`;
            tokensDiv.appendChild(span);
        });

    contenedor.appendChild(tokensDiv);
    divPaciente.appendChild(contenedor);
}

function togglePanelTriaje() {
    const panel = document.getElementById("panelTriaje");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
}
