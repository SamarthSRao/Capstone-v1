import torch
import torch.nn as nn

class BayesianLSTM(nn.Module):
    def __init__(self, input_size=1, hidden_size=64, num_layers=2, dropout_rate=0.2):
        super(BayesianLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=dropout_rate if num_layers > 1 else 0)
        self.dropout = nn.Dropout(dropout_rate)
        # Outputs: mean (mu) and log variance (logvar) for aleatoric uncertainty
        self.fc_mu = nn.Linear(hidden_size, 1)
        self.fc_logvar = nn.Linear(hidden_size, 1)

    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        
        out, _ = self.lstm(x, (h0, c0))
        # Keep dropout active during inference for MC Dropout (epistemic uncertainty)
        out = self.dropout(out[:, -1, :])
        
        mu = self.fc_mu(out)
        logvar = self.fc_logvar(out)
        return mu, logvar
