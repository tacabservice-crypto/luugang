# Agent Promo Code Feature: Implementation Plan

This document outlines the step-by-step plan to implement the agent-based promo code and player-locking system.

### **Objective**
To create a system where players can register using an agent's unique promo code, locking them to that agent for all financial transactions. This gives agents autonomy over their customer base.

---

### **Step 1: Update Database & Type Definitions**
- **Modify `Agent` data model:**
  - Add a new field: `promoCode: string` to the `Agent` type. This code must be unique for each agent.
- **Modify `UserProfile` data model:**
  - Add a new field: `linkedAgentId?: string` to the `UserProfile` type. This will store the ID of the agent the player is locked to.

### **Step 2: Modify Admin Panel for Promo Code Management**
- **Update "Create Agent" form:**
  - Add a "Promo Code" text input field.
- **Update "Edit Agent" form:**
  - Add a "Promo Code" text input field to allow viewing and changing the code.
- **Backend Validation:**
  - Implement logic in `server.ts` on the create and update agent endpoints to ensure that every `promoCode` is unique across all agents before saving.

### **Step 3: Update Player Registration Flow**
- **Frontend (UI):**
  - Add an optional "Promo Code" input field to the player registration form.
- **Backend (`server.ts`):**
  - Modify the `/api/auth/login` endpoint (or the relevant registration endpoint).
  - When a new user registers with a promo code, find the agent with that code.
  - If an agent is found, save their `id` into the new user's `linkedAgentId` field.
  - If no agent is found for the provided code, return an error to the user.

### **Step 4: Enforce Agent Lock on Transactions**
- **Backend (`server.ts`):**
  - Modify the endpoints that handle player-initiated transactions (e.g., `/api/request-to-agent`).
  - When a player with a `linkedAgentId` attempts a transaction, verify that the request is directed to their linked agent.
  - If the `agentId` in the request does not match the player's `linkedAgentId`, reject the transaction with an error message explaining they can only use their assigned agent.

### **Step 5: Enhance Agent Dashboard**
- **Display Promo Code:**
  - On the agent dashboard, display the agent's own `promoCode` so they can share it.
- **"My Players" List:**
  - Create a new API endpoint (e.g., `GET /api/agent/my-players`) that returns all users where `linkedAgentId` matches the agent's ID.
  - Add a new section/table on the agent dashboard to display this list of linked players, showing their username, avatar, and other relevant details.
