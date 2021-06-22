const process = require('process');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT });
const sqlite3 = require('sqlite3');
let baseDatos = new sqlite3.Database('atds3_ppf.db');
let temporizadorInvalidacionFichas;


function iniciarBaseDatos() {
	baseDatos.exec("PRAGMA page_size = 8192");
	baseDatos.exec("PRAGMA temp_store = MEMORY");
	baseDatos.exec("PRAGMA journal_mode = OFF");
	baseDatos.exec("PRAGMA locking_mode = EXCLUSIVE");
	baseDatos.exec("PRAGMA synchronous = OFF");
	
	baseDatos.exec("CREATE TABLE IF NOT EXISTS fichas (id INTEGER PRIMARY KEY AUTOINCREMENT, ficha TEXT NOT NULL, expiracion INTEGER NOT NULL)");
	baseDatos.exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_fichas_ficha ON fichas (ficha)");
	
	temporizadorInvalidacionFichas = setInterval(eventoInvalidacacionFichas, 60000);
}

function comandoAportarFicha(mensaje) {
	if (mensaje["ficha"] !== undefined && mensaje["expiracion"] !== undefined) {
		baseDatos.exec(`INSERT INTO fichas (ficha, expiracion) VALUES ('${mensaje.ficha}', ${mensaje.expiracion})`);
	}
}

function comandoObtenerFicha(socalo) {
	let resultados = baseDatos.exec("SELECT ficha FROM fichas ORDER BY random() LIMIT 1");
	
	socalo.send({ accion: "entregarFicha", ficha: resultados["ficha"]});
}

function eventoInvalidacacionFichas() {
	baseDatos.exec("DELETE FROM fichas WHERE (datetime('now') >= datetime(expiracion,'unixepoch'))");
	baseDatos.exec("VACUUM");
}

function eventoConexion(socalo) {
	socalo.on("message", function eventoMensaje(mensaje) {
		if (mensaje.accion === "aportarFicha") {
			comandoAportarFicha(mensaje);
		}
		if (mensaje.accion === "obtenerFicha") {
			comandoObtenerFicha(socalo);
		}
	});
}


iniciarBaseDatos();

wss.on("connection", eventoConexion);
