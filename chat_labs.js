// Listen to chat messages
let counter = 0;

const socket = io({
    auth: {
        serverOffset: 0
    },

    // enable retries
    ackTimeout: 10000,
    retries: 3,

});

const messages = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");

form.addEventListener("submit", (e) => {

    e.preventDefault();

    if (input.value) {
      
      // compute a unique offset
      const clientOffset = `${socket.id}-${counter++}`;
      socket.emit('chat message', input.value, clientOffset);
      input.value = "";

    }

});

socket.on("chat message", (msg, serverOffset) => {

    let item = document.createElement("li");
    item.textContent = msg;
    messages.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
    socket.auth.serverOffset = serverOffset;

});


// Recover from connection state failures
const toggleButton = document.getElementById("toggle-btn");

toggleButton.addEventListener("click", (e) => {

    e.preventDefault();

    if (socket.connected) {
        toggleButton.innerText = "Connect";
        socket.disconnect();
    } else {
        toggleButton.innerText = "Disconnect";
        socket.connect();
    }

});