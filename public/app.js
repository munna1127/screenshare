const socket = io();

const params = new URLSearchParams(window.location.search);
const room = params.get("room");

let username = localStorage.getItem("username") || "User";

document.getElementById("roomId").innerText = "Room: " + room;

let peers = {};
let localStream;

// STATUS
socket.on("connect", () => {
  const status = document.getElementById("status");
  if (status) status.innerText = "🟢 Connected";
});

// JOIN WITH NAME
socket.emit("join-room", { room, username });

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
    video.muted = id === "me";

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
  const box = document.createElement("div");
  box.className = "video-box";
  box.innerHTML = `<div class="camera-off">📷 OFF</div>`;
  document.getElementById("videos").appendChild(box);
}

// USER JOIN
socket.on("user-joined", ({ userId, username }) => {
  createPeer(userId, true, username);
});

// SIGNAL
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
function createPeer(userId, initiator, name = "User") {
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
    const stream = e.streams[0];
    addVideo(stream, userId, name);
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

// SHARE
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

// COPY
function copyLink() {
  navigator.clipboard.writeText(window.location.href)
    .then(() => alert("Link copied!"));
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

// START
startCamera();
