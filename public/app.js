const socket = io();

const params = new URLSearchParams(window.location.search);
const room = params.get("room");

const username = localStorage.getItem("username") || "User";

document.getElementById("roomId").innerText = "Room: " + room;

let peers = {};
let users = {};

let videoTrack, audioTrack;

// status
socket.on("connect", () => {
  document.getElementById("status").innerText = "🟢 Connected";
});

// join
socket.emit("join-room", room);

// add self
addUser(socket.id, username);

// user join
socket.on("user-joined", userId => {
  createPeer(userId, true);
  addUser(userId, "User");
});

// signal
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

// create peer
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

// video
function addVideo(stream, id) {
  let video = document.getElementById(id);

  if (!video) {
    video = document.createElement("video");
    video.id = id;
    video.autoplay = true;
    video.onclick = () => video.requestFullscreen();
    document.getElementById("videos").appendChild(video);
  }

  video.srcObject = stream;
}

// camera
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  videoTrack = stream.getVideoTracks()[0];
  audioTrack = stream.getAudioTracks()[0];

  addVideo(new MediaStream([videoTrack, audioTrack]), "me");
}

// toggle
function toggleCamera() {
  if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
}

function toggleMute() {
  if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
}

// share
async function startShare() {
  if (!navigator.mediaDevices.getDisplayMedia) {
    alert("Not supported on mobile");
    return;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  videoTrack = stream.getVideoTracks()[0];

  addVideo(new MediaStream([videoTrack]), "me");
}

// chat
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

// users
function addUser(id, name) {
  users[id] = name;

  const ul = document.getElementById("users");
  ul.innerHTML = "";

  for (let uid in users) {
    const li = document.createElement("li");
    li.innerText = users[uid];
    ul.appendChild(li);
  }
}

// copy link
function copyLink() {
  navigator.clipboard.writeText(window.location.href);
  alert("Link copied!");
                  }
