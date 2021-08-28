const process = require('process');
const { createHash } = require('crypto');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: parseInt(process.env.PORT) });
const sqlite3 = require('sqlite3');
let baseDatos = new sqlite3.Database('atds3_ppf.db');
let temporizadorInvalidacionFichas;


function iniciarBaseDatos() {
	baseDatos.exec("CREATE TABLE IF NOT EXISTS fichas (id INTEGER PRIMARY KEY AUTOINCREMENT, ficha TEXT NOT NULL, expiracion INTEGER NOT NULL, solo_publicacion BOOLEAN NOT NULL)", () => {});
	baseDatos.exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_fichas_ficha ON fichas (ficha)", () => {});
	
	temporizadorInvalidacionFichas = setInterval(eventoInvalidacacionFichas, 60000);
}

function validarLlaveAcceso(llave) {
	const tiempoActual = new Date();
	const dia = tiempoActual.getUTCDate();
	const mes = tiempoActual.getUTCMonth() + 1;
	const hora = tiempoActual.getUTCHours();
	const minutos = tiempoActual.getUTCMinutes();
	const llaveAcceso = `${dia}${mes}${hora}${minutos}_ATDS3_82111232304_ATDS3_${dia}${mes}${hora}${minutos}`;
	const hash = createHash('sha256');

	hash.update(llaveAcceso);
	if (llave === hash.digest('hex')) {
		return true;
	}

	return false;
}

function comandoAportarFicha(mensaje) {
	let soloPublicacion = false;
	
	if (mensaje['solo_publicacion'] !== undefined) {
		if (mensaje.solo_publicacion === 'false') {
			soloPublicacion = false;
		} else if (mensaje.solo_publicacion === 'true') {
			soloPublicacion = true;
		} else {
			soloPublicacion = mensaje.solo_publicacion;
		}
	}
	
	baseDatos.exec(`INSERT INTO fichas (ficha, expiracion, solo_publicacion) VALUES ('${mensaje.ficha}', ${mensaje.expiracion}, ${soloPublicacion})`, () => {});
	
	if (soloPublicacion === true) {
		console.info(`Ficha aportada: ${mensaje.ficha}; Solo publicacion: ${(soloPublicacion === false ? 'No' : 'Si')}`);
	} else {
		console.info(`Ficha aportada: ${mensaje.ficha}`);
	}
}

function comandoSolicitarFicha(socalo, publicacion) {
	baseDatos.get(`SELECT ficha FROM fichas WHERE (solo_publicacion = ${publicacion}) ORDER BY random() LIMIT 1`, (_error, fila) => {
		socalo.send(JSON.stringify({ accion: "entregarFicha", ficha: fila.ficha}));
		console.info(`Ficha entregada: ${fila.ficha}; Publicacion: ${publicacion}`);
	});
}

function eventoInvalidacacionFichas() {
	baseDatos.exec("DELETE FROM fichas WHERE (datetime('now') >= datetime(expiracion,'unixepoch'))", () => {});
	baseDatos.exec("VACUUM", () => {});
}

function eventoConexion(socalo) {
	socalo.estaVivo = true;

	socalo.on("message", function eventoMensaje(datos) {
		try {
			const mensaje = JSON.parse(datos);
			
			if (mensaje['acceso'] !== undefined) {
				if (validarLlaveAcceso(mensaje.acceso) === true) {
					if (mensaje.accion === 'aportarFicha') {
						comandoAportarFicha(mensaje);
					}
					if (mensaje.accion === 'solicitarFicha') {
						comandoSolicitarFicha(socalo, (mensaje['publicacion'] === undefined ? false : mensaje.publicacion));
					}
				}
			}
		} catch (e) {
			console.info(e)
		}
	});
	
	socalo.on("ping", function ping() {
		socalo.estaVivo = true;
	});
	
	socalo.on("close", function cerrar() {
		clearInterval(socalo.temporizadorVerificarConexion);
	})
	
	socalo.temporizadorVerificarConexion = setInterval(function verificarConexion() {
		if (socalo.estaVivo === false) {
			return socalo.terminate();
		} else {
			socalo.estaVivo = false;
		}
	}, 20000);
}


iniciarBaseDatos();

wss.on("connection", eventoConexion);
