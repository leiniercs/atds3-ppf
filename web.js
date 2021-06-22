const process = require('process');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: parseInt(process.env.PORT) });
const sqlite3 = require('sqlite3');
let baseDatos = new sqlite3.Database('atds3_ppf.db');
let temporizadorInvalidacionFichas;


function iniciarBaseDatos() {
	baseDatos.exec("CREATE TABLE IF NOT EXISTS fichas (id INTEGER PRIMARY KEY AUTOINCREMENT, ficha TEXT NOT NULL, expiracion INTEGER NOT NULL)");
	baseDatos.exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_fichas_ficha ON fichas (ficha)");
	
	temporizadorInvalidacionFichas = setInterval(eventoInvalidacacionFichas, 60000);
}

function comandoAportarFicha(mensaje) {
	try {
		baseDatos.exec(`INSERT INTO fichas (ficha, expiracion) VALUES ('${mensaje.ficha}', ${mensaje.expiracion})`);
	} catch (_e) {}
}

function comandoSolicitarrFicha(socalo) {
	let resultados = baseDatos.exec("SELECT ficha FROM fichas ORDER BY random() LIMIT 1");
	
	socalo.send({ accion: "entregarFicha", ficha: resultados["ficha"]});
}

function eventoInvalidacacionFichas() {
	baseDatos.exec("DELETE FROM fichas WHERE (datetime('now') >= datetime(expiracion,'unixepoch'))");
	baseDatos.exec("VACUUM");
}

function eventoConexion(socalo) {
	socalo.estaVivo = true;

	socalo.on("message", function eventoMensaje(mensaje) {
		try {
			if (mensaje.accion === 'aportarFicha') {
				comandoAportarFicha(mensaje);
			}
			if (mensaje.accion === 'solicitarrFicha') {
				comandoSolicitarrFicha(socalo);
			}
		} catch (_e) {}
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
