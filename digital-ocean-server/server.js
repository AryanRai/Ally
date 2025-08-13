const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["https://aryanrai.me", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store active Ally instances
const allyInstances = new Map();
const webClients = new Map();

// Generate unique token for Ally registration
app.post('/api/ally/register', (req, res) => {
  const { allyId, name } = req.body;
  const token = uuidv4();
  
  allyInstances.set(token, {
    allyId,
    name: name || 'Ally',
    status: 'offline',
    lastSeen: new Date(),
    socket: null
  });
  
  res.json({ token, allyId });
});

// Get all registered Ally instances
app.get('/api/ally/instances', (req, res) => {
  const instances = Array.from(allyInstances.entries()).map(([token, data]) => ({
    token,
    ...data,
    socket: undefined // Don't send socket object
  }));
  res.json(instances);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Ally connection
  socket.on('ally:connect', (data) => {
    const { token } = data;
    const ally = allyInstances.get(token);
    
    if (ally) {
      ally.status = 'online';
      ally.socket = socket;
      ally.lastSeen = new Date();
      
      socket.join(`ally:${token}`);
      socket.allyToken = token;
      
      console.log(`Ally connected: ${ally.name} (${token})`);
      
      // Notify web clients
      socket.broadcast.emit('ally:status', { token, status: 'online', ally });
    }
  });

  // Web client connection
  socket.on('web:connect', (data) => {
    const { clientId } = data;
    webClients.set(socket.id, { clientId, socket });
    socket.join('web-clients');
    
    // Send current Ally instances
    const instances = Array.from(allyInstances.entries()).map(([token, data]) => ({
      token,
      ...data,
      socket: undefined
    }));
    socket.emit('ally:instances', instances);
  });

  // Web client sends command to Ally
  socket.on('command:send', (data) => {
    const { token, command, payload } = data;
    const ally = allyInstances.get(token);
    
    if (ally && ally.socket) {
      ally.socket.emit('command:receive', { command, payload });
      console.log(`Command sent to ${ally.name}: ${command}`);
    } else {
      socket.emit('error', { message: 'Ally not connected' });
    }
  });

  // Ally sends response back
  socket.on('response:send', (data) => {
    const { response, type } = data;
    const token = socket.allyToken;
    
    if (token) {
      // Broadcast to all web clients
      io.to('web-clients').emit('response:receive', { token, response, type });
    }
  });

  // Ally sends status update
  socket.on('ally:status', (data) => {
    const token = socket.allyToken;
    const ally = allyInstances.get(token);
    
    if (ally) {
      ally.lastSeen = new Date();
      Object.assign(ally, data);
      
      // Broadcast to web clients
      io.to('web-clients').emit('ally:status', { token, ...data });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Handle Ally disconnect
    if (socket.allyToken) {
      const ally = allyInstances.get(socket.allyToken);
      if (ally) {
        ally.status = 'offline';
        ally.socket = null;
        
        // Notify web clients
        io.to('web-clients').emit('ally:status', { 
          token: socket.allyToken, 
          status: 'offline' 
        });
      }
    }
    
    // Handle web client disconnect
    webClients.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Ally middleware server running on port ${PORT}`);
});