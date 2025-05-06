import torch
import torch.nn as nn
from transformers import XLMRobertaModel

class FocalLoss(nn.Module):
    def __init__(self, alpha=None, gamma=2.0, reduction='mean'):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction

    def forward(self, inputs, targets):
        ce_loss = nn.functional.cross_entropy(inputs, targets, weight=self.alpha, reduction='none')
        pt = torch.exp(-ce_loss)
        focal_loss = (1 - pt) ** self.gamma * ce_loss
        return focal_loss.mean() if self.reduction == 'mean' else focal_loss.sum()


class TriageRoberta(nn.Module):
    def __init__(self, class_weights=None):
        super().__init__()
        self.roberta = XLMRobertaModel.from_pretrained("xlm-roberta-base")
        self.dropout = nn.Dropout(0.3)
        self.classifier = nn.Linear(self.roberta.config.hidden_size, 5)
        self.loss_fn = FocalLoss(alpha=class_weights) if class_weights is not None else nn.CrossEntropyLoss()
        self.config = self.roberta.config
        self.num_labels = 5  # útil para tareas multi-clase

    def forward(self, input_ids, attention_mask, labels=None):
        outputs = self.roberta(input_ids=input_ids, attention_mask=attention_mask)
        cls_token = outputs.last_hidden_state[:, 0, :]
        cls_token = self.dropout(cls_token)
        logits = self.classifier(cls_token)
        loss = self.loss_fn(logits, labels) if labels is not None else None
        return {"loss": loss, "logits": logits}

