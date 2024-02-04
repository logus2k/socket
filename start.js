import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { availableParallelism } from 'node:os';
import cluster from 'node:cluster';
import { createAdapter, setupPrimary } from '@socket.io/cluster-adapter';

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();
  // create one worker per available core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({
      PORT: 9696 + i
    });
  }

  // set up the adapter on the primary thread
  setupPrimary();

} else {

  // open the database file
  const db = await open({
    filename: "chat.db",
    driver: sqlite3.Database
  });

  // create the 'messages' table (you can ignore the 'client_offset' column for now)
  await db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT
  );`);

  const app = express();

  app.use("/", express.static("./", { index: "index.html" }));
  app.use(cors);

  const server = createServer(app);

  const io = new Server(server, {
    connectionStateRecovery: {},
    adapter: createAdapter()
  });

  io.on("connection", async (socket) => {

    console.log("User connected");

    socket.on("chat message", async (msg, clientOffset, callback) => {

      let result;

      try {
        result = await db.run("INSERT INTO messages (content, client_offset) VALUES (?, ?)", msg, clientOffset);
      } catch (e) {
        if (e.errno === 19 /* SQLITE_CONSTRAINT */) {
          // the message was already inserted, so we notify the client
          callback();
        } else {
          // nothing to do, just let the client retry
        }
        return;
      }

      io.emit("chat message", msg, result.lastID);

      // If we don't acknowledge the event the client will keep retrying (up to retries times)
      callback();

    });

    if (!socket.recovered) {
      // if the connection state recovery was not successful
      try {
        await db.each("SELECT id, content FROM messages WHERE id > ?",
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit("chat message", row.content, row.id);
          }
        )
      } catch (e) {
        // something went wrong
      }
    }

    socket.on("disconnect", (msg) => {
      console.log("User disconnected -> ", msg);
    });

  });

  server.listen(process.env.PORT, () => {
    console.log("Listening on http://localhost:" + process.env.PORT.toString());
  });

}
