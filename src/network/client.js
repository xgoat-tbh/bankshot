import { decodeTelemetry, GhostBuffer } from './protocol.js';
export { resolveRelayUrl } from './relay.js';

export class RaceClient extends EventTarget {
  constructor(url) { super();this.url=url;this.offset=0;this.rtt=Infinity;this.peers=new Map();this.ghosts=new Map();this.closed=false;this.retries=0; }
  emit(type,detail) {this.dispatchEvent(new CustomEvent(type,{detail}));}
  connect(request) {
    this.request=request;
    this.socket=new WebSocket(this.url);this.socket.binaryType='arraybuffer';
    this.socket.onopen=()=>{this.retries=0;this.send(this.token?{type:'resume',token:this.token,code:this.code}:this.request);this.ping();clearInterval(this.pingTimer);this.pingTimer=setInterval(()=>this.ping(),5000);};
    this.socket.onerror=()=>this.emit('notice','Could not connect. Start the race server or check its address.');
    this.socket.onclose=()=>{if(this.closed)return;this.emit('disconnected');this.emit('notice','Connection lost. Reconnecting…');if(this.retries++<10)this.retryTimer=setTimeout(()=>this.connect(this.request),Math.min(3000,500*this.retries));else this.emit('notice','Reconnect failed. Leave and rejoin the lobby.');};
    this.socket.onmessage=async event=>{
      if(event.data instanceof ArrayBuffer){const bytes=new Uint8Array(event.data);if(bytes.length===11)this.receiveFrame(bytes[0],bytes.slice(1).buffer);return;}
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='joined'){Object.assign(this,{id:message.id,token:message.token,code:message.code});this.emit('joined',message);}
      if(message.type==='room'){
        this.room=message;
        for(const player of message.players)if(player.id!==this.id && player.connected && this.id<player.id && !this.peers.has(player.id))this.offer(player.id);
        for(const [id,peer]of this.peers)if(!message.players.some(p=>p.id===id&&p.connected)){peer.connection.close();this.peers.delete(id);}
        this.emit('room',message);
      }
      if(message.type==='pong'){
        const received=Date.now(),rtt=(received-message.sent)-(message.serverSent-message.serverReceived);
        if(rtt<=this.rtt*1.25){this.rtt=rtt;this.offset=((message.serverReceived-message.sent)+(message.serverSent-received))/2;}
      }
      if(message.type==='signal')await this.signal(message.from,message.signal);
      if(message.type==='accepted')this.emit('accepted',message);
      if(message.type==='error')this.emit('notice',message.message);
    };
  }
  send(message){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  ping(){this.send({type:'ping',sent:Date.now()});}
  serverNow(){return Date.now()+this.offset;}
  receiveFrame(id,data){try{const frame=decodeTelemetry(data);let buffer=this.ghosts.get(id);if(!buffer){buffer=new GhostBuffer();this.ghosts.set(id,buffer);}buffer.push(frame,this.serverNow());}catch{}}
  makePeer(id){
    if(typeof RTCPeerConnection==='undefined')return null;
    const connection=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const peer={connection,channel:null};this.peers.set(id,peer);
    connection.onicecandidate=event=>{if(event.candidate)this.send({type:'signal',to:id,signal:{candidate:event.candidate.toJSON()}});};
    connection.ondatachannel=event=>this.attachChannel(id,event.channel);
    connection.onconnectionstatechange=()=>{if(['failed','closed'].includes(connection.connectionState)){peer.channel?.close();connection.close();this.peers.delete(id);}};
    return peer;
  }
  attachChannel(id,channel){const peer=this.peers.get(id);if(!peer)return;peer.channel=channel;channel.binaryType='arraybuffer';channel.onmessage=event=>this.receiveFrame(id,event.data);}
  async offer(id){try{const peer=this.makePeer(id);if(!peer)return;this.attachChannel(id,peer.connection.createDataChannel('puck',{ordered:false,maxRetransmits:0}));await peer.connection.setLocalDescription(await peer.connection.createOffer());this.send({type:'signal',to:id,signal:{description:peer.connection.localDescription}});}catch{/* WebSocket telemetry remains available. */}}
  async signal(id,signal){try{const peer=this.peers.get(id)??this.makePeer(id);if(!peer)return;if(signal.description){await peer.connection.setRemoteDescription(signal.description);if(signal.description.type==='offer'){await peer.connection.setLocalDescription(await peer.connection.createAnswer());this.send({type:'signal',to:id,signal:{description:peer.connection.localDescription}});}}else if(signal.candidate)await peer.connection.addIceCandidate(signal.candidate);}catch{/* Relay fallback is independent of peer setup. */}}
  telemetry(data){
    let needsRelay=false;
    for(const player of this.room?.players??[]){if(player.id===this.id||!player.connected)continue;const channel=this.peers.get(player.id)?.channel;if(channel?.readyState==='open'&&channel.bufferedAmount<4096)channel.send(data);else needsRelay=true;}
    if(needsRelay && this.socket?.readyState===WebSocket.OPEN && this.socket.bufferedAmount<8192)this.socket.send(data);
  }
  close(){this.closed=true;clearInterval(this.pingTimer);clearTimeout(this.retryTimer);this.socket?.close();for(const peer of this.peers.values())peer.connection.close();this.peers.clear();}
}
