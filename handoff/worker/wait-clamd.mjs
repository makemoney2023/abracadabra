import net from "node:net";

function ping() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: 3310 });
    let data = "";
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);
    socket.on("connect", () => {
      socket.write("nPING\n");
    });
    socket.on("data", (chunk) => {
      data += chunk.toString();
      if (data.includes("PONG")) {
        clearTimeout(timer);
        socket.end();
        resolve(true);
      }
    });
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

for (let attempt = 0; attempt < 90; attempt += 1) {
  if (await ping()) process.exit(0);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.error("clamd did not answer");
process.exit(1);
