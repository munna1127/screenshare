const socket = io();

const params = new URLSearchParams(window.location.search);
const room = params.get("room");

document.getElementById("roomId").innerText = "Room ID: " + room;

let peers = {};
let localStream;

let videoTrack = null;
let audioTrack = null;

let isMuted = false;
let cameraOn = true;

socket.emit("join-room", room);

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

socket.on("chat", msg => {
  const div = document.createElement("div");
  div.innerText = msg;
  document.getElementById("messages").appendChild(div);
});

function createPeer(userId, initiator) {
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  });

  peers[userId] = peer;

  if (videoTrack) peer.addTrack(videoTrack);
  if (audioTrack) peer.addTrack(audioTrack);

  peer.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("signal", {
        userId,
        data: { candidate: e.candidate }
      });
    }
  };

  peer.ontrack = e => {
    addVideo(e.streams[0], userId);
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

function addVideo(stream, id) {
  let video = document.getElementById(id);

  if (!video) {
    video = document.createElement("video");
    video.id = id;
    video.autoplay = true;
    video.muted = id === "me";
    document.getElementById("videos").appendChild(video);
  }

  video.srcObject = stream;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  videoTrack = stream.getVideoTracks()[0];
  audioTrack = stream.getAudioTracks()[0];

  localStream = new MediaStream([videoTrack, audioTrack]);

  addVideo(localStream, "me");

  for (let id in peers) {
    const senders = peers[id].getSenders();

    const v = senders.find(s => s.track?.kind === "video");
    const a = senders.find(s => s.track?.kind === "audio");

    if (v) v.replaceTrack(videoTrack);
    else peers[id].addTrack(videoTrack, localStream);

    if (a) a.replaceTrack(audioTrack);
    else peers[id].addTrack(audioTrack, localStream);
  }
}

function toggleCamera() {
  if (!videoTrack) return;

  cameraOn = !cameraOn;
  videoTrack.enabled = cameraOn;

  document.getElementById("camBtn").innerText =
    cameraOn ? "❌ Camera OFF" : "🎥 Camera ON";
}

function toggleMute() {
  if (!audioTrack) return;

  isMuted = !isMuted;
  audioTrack.enabled = !isMuted;

  document.getElementById("micBtn").innerText =
    isMuted ? "🔇 Mic OFF" : "🎤 Mic ON";
}

async function startShare() {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true
  });

  const screenTrack = screenStream.getVideoTracks()[0];
  videoTrack = screenTrack;

  localStream = new MediaStream([videoTrack]);
  addVideo(localStream, "me");

  for (let id in peers) {
    const sender = peers[id]
      .getSenders()
      .find(s => s.track?.kind === "video");

    if (sender) sender.replaceTrack(videoTrack);
  }

  screenTrack.onended = () => {
    startCamera();
  };
}

function sendMessage() {
  const input = document.getElementById("msgInput");
  socket.emit("chat", input.value);
  input.value = "";
                            }
