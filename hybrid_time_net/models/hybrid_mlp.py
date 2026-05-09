import torch
import torch.nn as nn

class HybridMLPFusion(nn.Module):
    def __init__(self, input_size=3, hidden_size=32):
        """
        input_size: Usually 3 (LSTM prediction, NeuralProphet prediction, XGBoost residual prediction)
        """
        super(HybridMLPFusion, self).__init__()
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.2)
        self.fc2 = nn.Linear(hidden_size, 1)

    def forward(self, x):
        out = self.fc1(x)
        out = self.relu(out)
        out = self.dropout(out)
        out = self.fc2(out)
        return out
