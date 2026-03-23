const socket = io();

const params = new URLSearchParams(window.location.search);
const room = params.get("room");

const username = localStorage.getItem("username") || "User";

document.getElementById("roomId").innerText = "Room: " + room;

let peers = {};
let localStream;

// STATUS FIX
socket.on("connect", () => {
  const status = document.getElementById("status");
  if (status) status.innerText = "🟢 Connected";
});

// join
socket.emit("join-room", room);

// CAMERA
async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    addVideo(localStream, "me", username);

  } catch {
    showCameraOff("me", username);
  }
}

// ADD VIDEO
function addVideo(stream, id, name) {
  let box = document.getElementById(id);

  if (!box) {
    box = document.createElement("div");
    box.className = "video-box";
    box.id = id;

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;

    video.onclick = () => {
      if (video.requestFullscreen) video.requestFullscreen();
    };

    const label = document.createElement("div");
    label.className = "username";
    label.innerText = name;

    box.appendChild(video);
    box.appendChild(label);
    document.getElementById("videos").appendChild(box);
  }

  const video = box.querySelector("video");
  video.srcObject = stream;
}

// CAMERA OFF
function showCameraOff(id, name) {
  let box = document.createElement("div");
  box.className = "video-box";
  box.innerHTML = `<div class="camera-off">📷 OFF</div>`;
  document.getElementById("videos").appendChild(box);
}

// PEER
socket.on("user-joined", userId => {
  createPeer(userId, true);
});

socket.on("signal", async ({ userId, data }) => {
  if (!peers[userId]) createPeer(userId, false);

  const peer = peers[userId];

  if (data.sdp) {
    await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));

    if (data.sdp.type === "offer") {
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("signal", {
        userId,
        data: { sdp: peer.localDescription }
      });
    }
  }

  if (data.candidate) {
    try {
      await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch {}
  }
});

// CREATE PEER
function createPeer(userId, initiator) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  peers[userId] = peer;

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });
  }

  peer.ontrack = e => {
    if (e.streams && e.streams[0]) {
      addVideo(e.streams[0], userId, "User");
    }
  };

  peer.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("signal", {
        userId,
        data: { candidate: e.candidate }
      });
    }
  };

  if (initiator) {
    peer.createOffer().then(offer => {
      peer.setLocalDescription(offer);
      socket.emit("signal", {
        userId,
        data: { sdp: offer }
      });
    });
  }
}

// TOGGLE
function toggleCamera() {
  if (!localStream) return;
  localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
}

function toggleMute() {
  if (!localStream) return;
  localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
}

// SCREEN SHARE
async function startShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true
    });

    const track = stream.getVideoTracks()[0];

    for (let id in peers) {
      const sender = peers[id].getSenders().find(s => s.track?.kind === "video");
      if (sender) sender.replaceTrack(track);
    }

    addVideo(stream, "me", username);

    track.onended = () => startCamera();

  } catch {
    alert("Screen share not supported");
  }
}

// COPY LINK
function copyLink() {
  try {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copied!");
  } catch {
    alert("Copy failed");
  }
}

// CHAT
socket.on("chat", msg => {
  const div = document.createElement("div");
  div.innerText = msg;
  document.getElementById("messages").appendChild(div);
});

function sendMessage() {
  const input = document.getElementById("msgInput");
  socket.emit("chat", username + ": " + input.value);
  input.value = "";
}

// SPEAKING EFFECT (SAFE)
navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  const mic = ctx.createMediaStreamSource(stream);

  mic.connect(analyser);
  analyser.fftSize = 256;

  const data = new Uint8Array(analyser.frequencyBinCount);

  function detect() {
    analyser.getByteFrequencyData(data);
    const volume = data.reduce((a, b) => a + b) / data.length;

    const box = document.getElementById("me");
    if (box) {
      box.style.boxShadow = volume > 30 ? "0 0 20px #00f" : "none";
    }

    requestAnimationFrame(detect);
  }

  detect();
});

// START
startCamera();
