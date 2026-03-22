const socket = io();

const params = new URLSearchParams(window.location.search);
const room = params.get("room");

let localStream;
let peers = {};
let isMuted = false;

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
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  peers[userId] = peer;

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

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });
  }

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
    document.getElementById("videos").appendChild(video);
  }

  video.srcObject = stream;
}

async function startCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  addVideo(localStream, "me");

  for (let id in peers) {
    localStream.getTracks().forEach(track => {
      peers[id].addTrack(track, localStream);
    });
  }
}

function toggleMute() {
  isMuted = !isMuted;

  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });
}

async function startShare() {
  localStream = await navigator.mediaDevices.getDisplayMedia({
    video: true
  });

  addVideo(localStream, "me");

  for (let id in peers) {
    localStream.getTracks().forEach(track => {
      peers[id].addTrack(track, localStream);
    });
  }
}

function sendMessage() {
  const input = document.getElementById("msgInput");
  socket.emit("chat", input.value);
  input.value = "";
}
