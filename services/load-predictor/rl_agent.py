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
        self.fc1 = nn.Linear(state_size, 24)
        self.fc2 = nn.Linear(24, 24)
        self.fc3 = nn.Linear(24, action_size)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        return self.fc3(x)

class RLAgent:
    def __init__(self, state_size=3, action_size=3):
        self.state_size = state_size
        self.action_size = action_size
        self.memory = deque(maxlen=2000)
        self.gamma = 0.95    # discount rate
        self.epsilon = 1.0  # exploration rate
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.learning_rate = 0.001
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        self.model = DQN(state_size, action_size).to(self.device)
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
        # Action 0: decrease, 1: keep, 2: increase
        step_size = 0.1
        if action == 0:
            self.current_z_score = max(0.0, self.current_z_score - step_size)
        elif action == 2:
            self.current_z_score = min(5.0, self.current_z_score + step_size)
        return self.current_z_score

    def replay(self, batch_size):
        if len(self.memory) < batch_size:
            return
        minibatch = random.sample(self.memory, batch_size)
        
        for state, action, reward, next_state, done in minibatch:
            state_tensor = torch.FloatTensor(state).to(self.device).unsqueeze(0)
            next_state_tensor = torch.FloatTensor(next_state).to(self.device).unsqueeze(0)
            target = reward
            if not done:
                with torch.no_grad():
                    target = (reward + self.gamma * torch.max(self.model(next_state_tensor)[0]).item())
                    
            target_f = self.model(state_tensor)
            # Copy to avoid changing other action values
            target_f_copy = target_f.clone().detach()
            target_f_copy[0][action] = target
            
            self.optimizer.zero_grad()
            loss = self.criterion(target_f, target_f_copy)
            loss.backward()
            self.optimizer.step()
            
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
            
    def save(self, filepath):
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'current_z_score': self.current_z_score
        }, filepath)
        
    def load(self, filepath):
        checkpoint = torch.load(filepath)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.current_z_score = checkpoint.get('current_z_score', 1.96)
        self.epsilon = self.epsilon_min # assuming we evaluate after loading
