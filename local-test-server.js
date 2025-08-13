const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000"],
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
  
  console.log(`Ally registered: ${name} with token: ${token}`);
  res.json({ token, allyId });
});

// Get all registered Ally instances
app.get('/api/ally/instances', (req, res) => {
  const instances = Array.from(allyInstances.entries()).map(([token, data]) => ({
    token,
    ...data,
    socket: undefined // Don't send socket object
  }));
  console.log(`API request for instances, returning ${instances.length} instances`);
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
      
      console.log(`✅ Ally connected: ${ally.name} (${token})`);
      
      // Send updated instances list to all web clients
      const instances = Array.from(allyInstances.entries()).map(([token, data]) => ({
        token,
        ...data,
        socket: undefined
      }));
      console.log(`📤 Broadcasting ${instances.length} instances to web clients`);
      io.to('web-clients').emit('ally:instances', instances);
      
      // Also notify about status change
      io.to('web-clients').emit('ally:status', { token, status: 'online', ally });
    } else {
      console.log(`❌ Unknown ally token attempted to connect: ${token}`);
    }
  });

  // Web client connection
  socket.on('web:connect', (data) => {
    const { clientId } = data;
    webClients.set(socket.id, { clientId, socket });
    socket.join('web-clients');
    
    console.log(`🌐 Web client connected: ${clientId}`);
    
    // Send current Ally instances
    const instances = Array.from(allyInstances.entries()).map(([token, data]) => ({
      token,
      ...data,
      socket: undefined
    }));
    console.log(`📤 Sending ${instances.length} instances to web client ${clientId}`);
    socket.emit('ally:instances', instances);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Handle Ally disconnect
    if (socket.allyToken) {
      const ally = allyInstances.get(socket.allyToken);
      if (ally) {
        ally.status = 'offline';
        ally.socket = null;
        console.log(`❌ Ally disconnected: ${ally.name}`);
      }
    }
    
    // Handle web client disconnect
    webClients.delete(socket.id);
  });
});

const PORT = 3002; // Different port for local testing
server.listen(PORT, () => {
  console.log(`🚀 Local test server running on port ${PORT}`);
  console.log(`Test it at: http://localhost:${PORT}/api/ally/instances`);
});