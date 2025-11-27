const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// In-memory state (resets when server restarts)
const state = {
  payments: [],
  ledgerBlocks: []
};

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function appendToLedger(payment) {
  const prevHash = state.ledgerBlocks.length
    ? state.ledgerBlocks[state.ledgerBlocks.length - 1].hash
    : "GENESIS";

  const payload = JSON.stringify({
    from: payment.from,
    to: payment.to,
    amount: payment.amount,
    corridor: payment.corridor,
    settlementHours: payment.settlementHours.toFixed(2),
    fee: payment.fee.toFixed(2)
  });

  const hash = simpleHash(prevHash + payload + Date.now());

  const block = {
    index: state.ledgerBlocks.length,
    prevHash,
    hash,
    payload,
    createdAt: new Date().toISOString()
  };

  state.ledgerBlocks.push(block);
}

// POST /api/payments  -> create a payment on chosen rail
app.post("/api/payments", (req, res) => {
  const { from, to, amount, corridor, rail } = req.body;

  if (!from || !to || !amount || !corridor || !rail) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  let settlementHours, fee, exception;

  if (rail === "legacy") {
    // Legacy rail – slower, more expensive, higher exception rate
    settlementHours = randomBetween(24, 48);          // T+1 style
    fee = numAmount * randomBetween(0.004, 0.008);    // 0.4%–0.8%
    exception = Math.random() < 0.2;                  // 20%
  } else if (rail === "blockchain") {
    // Blockchain rail – fast, cheaper, fewer exceptions
    settlementHours = randomBetween(0.1, 2);          // < 2 hours
    fee = numAmount * randomBetween(0.0008, 0.002);   // 0.08%–0.2%
    exception = Math.random() < 0.05;                 // 5%
  } else {
    return res.status(400).json({ error: "Invalid rail" });
  }

  const payment = {
    id: state.payments.length + 1,
    rail,
    from,
    to,
    amount: numAmount,
    corridor,
    settlementHours,
    fee,
    exception,
    createdAt: new Date().toISOString()
  };

  state.payments.push(payment);

  if (rail === "blockchain") {
    appendToLedger(payment);
  }

  res.json({ payment });
});

// GET /api/state -> returns all payments + ledger blocks
app.get("/api/state", (req, res) => {
  res.json({
    payments: state.payments,
    ledgerBlocks: state.ledgerBlocks
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dual-rail demo API listening on port ${PORT}`);
});
