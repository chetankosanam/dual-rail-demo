// backend/server.js
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

// POST /api/payments  -> create payment(s) on a rail
// - normal: returns 1 payment
// - blockchain failover: returns 2 payments (failed chain + legacy fallback)
app.post("/api/payments", (req, res) => {
  const { from, to, amount, corridor, rail } = req.body;

  if (!from || !to || !amount || !corridor || !rail) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  let settlementHours, fee, exception, failed = false;
  const createdPayments = [];

  if (rail === "legacy") {
    // LEGACY RAIL – slower, more expensive, more exceptions
    settlementHours = randomBetween(24, 48);
    fee = numAmount * randomBetween(0.004, 0.008);
    exception = Math.random() < 0.2;

    const payment = {
      id: state.payments.length + 1,
      rail: "legacy",
      from,
      to,
      amount: numAmount,
      corridor,
      settlementHours,
      fee,
      exception,
      failed: false,
      fallbackFrom: null,
      fallbackTo: null,
      createdAt: new Date().toISOString()
    };

    state.payments.push(payment);
    createdPayments.push(payment);
  } else if (rail === "blockchain") {
    // BLOCKCHAIN RAIL – normally fast/cheap/few exceptions
    settlementHours = randomBetween(0.1, 2);
    fee = numAmount * randomBetween(0.0008, 0.002);

    // 🔥 10% chance we simulate a blockchain rail failure
    const failover = Math.random() < 0.10;

    if (failover) {
      exception = true;
      failed = true;
    } else {
      exception = Math.random() < 0.05;
    }

    const chainPayment = {
      id: state.payments.length + 1,
      rail: "blockchain",
      from,
      to,
      amount: numAmount,
      corridor,
      settlementHours,
      fee,
      exception,
      failed,                // true only when failover triggered
      fallbackFrom: null,
      fallbackTo: failover ? "legacy" : null,
      createdAt: new Date().toISOString()
    };

    state.payments.push(chainPayment);
    createdPayments.push(chainPayment);

    // Only successful blockchain payments go into the ledger
    if (!failover) {
      appendToLedger(chainPayment);
    }

    // If blockchain "fails", automatically create Legacy fallback
    if (failover) {
      const legacyPayment = {
        id: state.payments.length + 1,
        rail: "legacy",
        from,
        to,
        amount: numAmount,
        corridor,
        settlementHours: randomBetween(24, 48),
        fee: numAmount * randomBetween(0.004, 0.008),
        exception: Math.random() < 0.2,
        failed: false,
        fallbackFrom: "blockchain",   // came from failed chain tx
        fallbackTo: null,
        createdAt: new Date().toISOString()
      };

      state.payments.push(legacyPayment);
      createdPayments.push(legacyPayment);
    }
  } else {
    return res.status(400).json({ error: "Invalid rail" });
  }

  res.json({ payments: createdPayments });
});

// GET /api/state -> all payments + blocks
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
