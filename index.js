const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const WebSocket = require('ws');
const LiveUser = require('./models/Liveruser'); // Assuming your schema is defined here
const Call = require('./models/CallsModel'); // New model for managing call states

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // WebSocket server

// Middleware to parse JSON request bodies
app.use(express.json()); 

// Fetch LiveUser data from MongoDB by userCallId
app.get('/api/liveUsers/:userCallId', async (req, res) => {
  const { userCallId } = req.params;

  try {
    const user = await LiveUser.findOne({ userCallId });

    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving user', error });
  }
});

// API to add a new user
app.post('/api/liveUsers', async (req, res) => {
  const { email, key, balance, userCallId, userName, isAdmin, password } = req.body;

  // Validate the request body to ensure necessary fields are present
  if (!email || !key || !userCallId || !userName) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Check if a user with the same email or userCallId already exists
    const existingUser = await LiveUser.findOne({ $or: [{ email }, { userCallId }] });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or userCallId already exists' });
    }

    // Create a new LiveUser document
    const newUser = new LiveUser({
      email,
      password,
      key,
      balance: balance || 0, // Default balance to 0 if not provided
      userCallId,
      userName,
      isAdmin: isAdmin || false // Default to false if not provided
    });

    // Save the new user to the database
    await newUser.save();

    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user', error });
  }
});


// API to fetch all live users except the logged-in user
app.get('/api/liveUsers', async (req, res) => {
  const loggedInEmail = req.query.loggedInEmail;

  try {
    const users = await LiveUser.find({ email: { $ne: loggedInEmail } })
      .sort({ email: -1, key: 1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving users', error });
  }
});

// API to update balance for a specific user
// app.put('/api/liveUsers/:userId/balance', async (req, res) => {
//   const { userId } = req.params;
//   const { updatedBalance } = req.body;

//   try {
//     const user = await LiveUser.findByIdAndUpdate(
//       userId,
//       { balance: updatedBalance },
//       { new: true } // Return the updated document
//     );

//     if (user) {
//       res.json({ message: 'Balance updated successfully', user });
//     } else {
//       res.status(404).json({ message: 'User not found' });
//     }
//   } catch (error) {
//     res.status(500).json({ message: 'Error updating balance', error });
//   }
// });
app.put('/api/liveUsers/:userId/balance', async (req, res) => {
  const { userId } = req.params;  // Take username instead of userId
  const { updatedBalance } = req.body;

  try {
    const user = await LiveUser.findOneAndUpdate(
      { userCallId: userId },  // Find by username instead of _id
      { balance: updatedBalance },
      { new: true }  // Return the updated document
    );

    if (user) {
      res.json({ message: 'Balance updated successfully', user });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error updating balance:', error.stack);
    res.status(500).json({ message: 'Error updating balance', error });
  }
});
// API to initiate or update a call state
// app.post('/api/calls/:callId', async (req, res) => {
//   const { callId } = req.params;
//   const { userId, status } = req.body; // Status could be 'in-call', 'ended', etc.

//   try {
//     const call = await Call.findByIdAndUpdate(
//       callId,
//       { 
//         [userId]: userId,
//         lastUpdated: new Date(),
//         status: status
//       },
//       { new: true, upsert: true } // Create a new document if it doesn't exist
//     );

//     if (call) {
//       res.json({ message: 'Call state updated successfully', call });
//     } else {
//       res.status(404).json({ message: 'Call not found' });
//     }
//   } catch (error) {
//     res.status(500).json({ message: 'Error updating call state', error });
//   }
// });


app.post('/api/calls/:callId', async (req, res) => {
  const { callId } = req.params;
  const { userId, status } = req.body; // Status could be 'in-call', 'ended', etc.

  try {
    // Find the call using the custom callId field
    const call = await Call.findOneAndUpdate(
      { callId: callId }, // Match custom callId field
      { 
        [userId]: status, // Store the status for the user
        lastUpdated: new Date(),
        status: status
      },
      { new: true, upsert: true } // Create a new document if it doesn't exist
    );

    if (call) {
      res.json({ message: 'Call state updated successfully', call });
    } else {
      res.status(404).json({ message: 'Call not found' });
    }
  } catch (error) {
    console.error('Error updating call state:', error);
    res.status(500).json({ message: 'Error updating call state', error: error.message });
  }
});
// MongoDB connection and real-time change stream setup for LiveUsers and Calls
mongoose.connect("mongodb+srv://Romalio:Romalio%40990@cluster0.s2mlcov.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('MongoDB connected');

    // Set up MongoDB change stream for real-time updates on LiveUsers collection
    const liveUsersChangeStream = LiveUser.watch();
    // const callsChangeStream = Call.watch();
    // const callsChangeStream = Call.watch([], { fullDocument: 'updateLookup' });
    const callsChangeStream = Call.watch([{ $match: { 'updateDescription.updatedFields.status': { $exists: true } } }], { fullDocument: 'updateLookup' });

    liveUsersChangeStream.on('change', (change) => {
      console.log('LiveUser Change detected:', change);

      // Broadcast the change to all connected WebSocket clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(change));
        }
      });
    });

    // Listen for changes in Calls collection to notify call state updates
    callsChangeStream.on('change', (change) => {
      console.log('Call Change detected:', change);

      // Notify all connected clients about call state changes
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(change));
        }
      });
    });

    // Start the server
    server.listen(5000, () => {
      console.log('Server running on port 5000');
    });
  })
  .catch(err => console.log('Error connecting to MongoDB:', err));

// WebSocket server connection handler
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    console.log('Received message:', message);
    // Handle incoming WebSocket messages
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

