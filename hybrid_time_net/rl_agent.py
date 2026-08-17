import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
import numpy as np
import random
from collections import deque

class DQN(nn.Module):
    def __init__(self, state_size, action_size):
        super(DQN, self).__init__()
        self.fc1 = nn.Linear(state_size, 64)
        self.fc2 = nn.Linear(64, 64)
        self.fc3 = nn.Linear(64, action_size)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        return self.fc3(x)

class RLAgent:
    def __init__(self, state_size=6, action_size=5):
        self.state_size = state_size
        self.action_size = action_size
        self.memory = deque(maxlen=50000)
        self.gamma = 0.99    # discount rate
        self.epsilon = 1.0   # exploration rate
        self.epsilon_min = 0.05
        self.epsilon_decay = 0.9975
        self.learning_rate = 0.0005
        self.tau = 0.005     # soft update parameter
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        self.model = DQN(state_size, action_size).to(self.device)
        self.target_model = DQN(state_size, action_size).to(self.device)
        self.target_model.load_state_dict(self.model.state_dict())
        
        self.optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)
        self.criterion = nn.MSELoss()
        
        self.current_z_score = 1.96

    def remember(self, state, action, reward, next_state, done):
        self.memory.append((state, action, reward, next_state, done))

    def act(self, state):
        if np.random.rand() <= self.epsilon:
            return random.randrange(self.action_size)
        state_tensor = torch.FloatTensor(state).to(self.device).unsqueeze(0)
        with torch.no_grad():
            act_values = self.model(state_tensor)
        return torch.argmax(act_values[0]).item()
        
    def step_z_score(self, action):
        # Action 0: decrease 0.2, 1: decrease 0.1, 2: keep, 3: increase 0.1, 4: increase 0.2
        if action == 0:
            self.current_z_score -= 0.2
        elif action == 1:
            self.current_z_score -= 0.1
        elif action == 3:
            self.current_z_score += 0.1
        elif action == 4:
            self.current_z_score += 0.2
        # Keep within bounds [0.0, 5.0]
        self.current_z_score = float(np.clip(self.current_z_score, 0.0, 5.0))
        return self.current_z_score

    def replay(self, batch_size):
        if len(self.memory) < batch_size:
            return
        minibatch = random.sample(self.memory, batch_size)
        
        states = np.array([x[0] for x in minibatch], dtype=np.float32)
        actions = np.array([x[1] for x in minibatch], dtype=np.int64)
        rewards = np.array([x[2] for x in minibatch], dtype=np.float32)
        next_states = np.array([x[3] for x in minibatch], dtype=np.float32)
        dones = np.array([x[4] for x in minibatch], dtype=np.float32)
        
        states_t = torch.FloatTensor(states).to(self.device)
        actions_t = torch.LongTensor(actions).to(self.device)
        rewards_t = torch.FloatTensor(rewards).to(self.device)
        next_states_t = torch.FloatTensor(next_states).to(self.device)
        dones_t = torch.FloatTensor(dones).to(self.device)
        
        # Get Q values for current states
        q_values = self.model(states_t)
        
        # Get target Q values for next states from target model
        with torch.no_grad():
            next_q_values = self.target_model(next_states_t)
            max_next_q_values = torch.max(next_q_values, dim=1)[0]
            targets = rewards_t + (1.0 - dones_t) * self.gamma * max_next_q_values
            
        # Select Q values for actions taken
        q_values_for_actions = q_values.gather(1, actions_t.unsqueeze(1)).squeeze(1)
        loss = self.criterion(q_values_for_actions, targets)
        
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        
        # Soft update target network
        for target_param, local_param in zip(self.target_model.parameters(), self.model.parameters()):
            target_param.data.copy_(self.tau * local_param.data + (1.0 - self.tau) * target_param.data)
            
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
            
    def save(self, filepath):
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'target_model_state_dict': self.target_model.state_dict(),
            'current_z_score': self.current_z_score,
            'epsilon': self.epsilon
        }, filepath)
        
    def load(self, filepath):
        checkpoint = torch.load(filepath, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        if 'target_model_state_dict' in checkpoint:
            self.target_model.load_state_dict(checkpoint['target_model_state_dict'])
        else:
            self.target_model.load_state_dict(checkpoint['model_state_dict'])
        self.current_z_score = checkpoint.get('current_z_score', 1.96)
        self.epsilon = checkpoint.get('epsilon', self.epsilon_min)
