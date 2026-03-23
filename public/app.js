const socket = io();

const params = new URLSearchParams(window.location.search);
const room = params.get("room");

const username = localStorage.getItem("username") || "User";

document.getElementById("roomId").innerText = "Room: " + room;

let peers = {};
let videoTrack, audioTrack;
let analyser, dataArray;

// join
socket.emit("join-room", room);

// ===== VIDEO ADD =====
function addVideo(stream, id, name = "User") {
  let box = document.getElementById(id);

  if (!box) {
    box = document.createElement("div");
    box.className = "video-box";
    box.id = id;

    const video = document.createElement("video");
    video.autoplay = true;

    const label = document.createElement("div");
    label.className = "username";
    label.innerText = name;

    box.appendChild(video);
    box.appendChild(label);

    document.getElementById("videos").appendChild(box);
  }

  const video = box.querySelector("video");
  video.srcObject = stream;

  detectSpeaking(stream, box);
}

// ===== CAMERA =====
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    videoTrack = stream.getVideoTracks()[0];
    audioTrack = stream.getAudioTracks()[0];

    addVideo(stream, "me", username);

  } catch {
    showCameraOff("me", username);
  }
}

// ===== CAMERA OFF =====
function showCameraOff(id, name) {
  let box = document.getElementById(id);

  if (!box) {
    box = document.createElement("div");
    box.className = "video-box";
    box.id = id;

    const off = document.createElement("div");
    off.className = "camera-off";
    off.innerText = "📷 OFF";

    const label = document.createElement("div");
    label.className = "username";
    label.innerText = name;

    box.appendChild(off);
    box.appendChild(label);

    document.getElementById("videos").appendChild(box);
  }
}

// ===== SPEAKING DETECT =====
function detectSpeaking(stream, box) {
  const audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();

  const mic = audioCtx.createMediaStreamSource(stream);
  mic.connect(analyser);

  dataArray = new Uint8Array(analyser.frequencyBinCount);

  function check() {
    analyser.getByteFrequencyData(dataArray);
    const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;

    if (volume > 20) {
      box.classList.add("speaking");
    } else {
      box.classList.remove("speaking");
    }

    requestAnimationFrame(check);
  }

  check();
}

// ===== PEER =====
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
    await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

function createPeer(userId, initiator) {
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  });

  peers[userId] = peer;

  if (videoTrack) peer.addTrack(videoTrack);
  if (audioTrack) peer.addTrack(audioTrack);

  peer.ontrack = e => addVideo(e.streams[0], userId);

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

// ===== TOGGLE =====
function toggleCamera() {
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
  }
}

function toggleMute() {
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
  }
}

// ===== START =====
startCamera();
