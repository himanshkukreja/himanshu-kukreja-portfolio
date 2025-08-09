---
slug: distributed-transactions-travel-booking
title: "Understanding Distributed Transactions in a Travel Booking System"
excerpt: "Exploring Two-Phase Commit (2PC) and the Saga Pattern in a microservices-based travel booking platform."
cover: "/blueprints/distributed-transactions.png"
date: "2025-08-09"
tags: ["Distributed Systems", "Microservices", "Transactions", "2PC", "Saga Pattern"]
---

## Understanding Distributed Transactions in a Travel Booking System

This document explores how to implement distributed transactions in a **microservices-based travel booking platform**, comparing **Two-Phase Commit (2PC)** and the **Saga Pattern**, with architectural details and trade-offs.

---

## 📖 Overview

Our travel booking system allows a user to book:
- **Flight**
- **Hotel**
- **Car rental**

as a **single logical transaction** — all must succeed or all must fail.

Each component is an **independent microservice** with:
- Its own database
- Deployed in different regions
- No shared database or direct DB access

### Key Challenges:
- Network failures between regions
- Service crashes mid-workflow
- High availability and low latency requirements
- Avoiding global locks that reduce throughput

---

## 🏗 System Architecture

```
[ API Gateway ]
       |
[ Booking Service / Transaction Orchestrator ]
       |------[ Flight Service ]---[ Flight DB ]
       |------[ Hotel Service ]----[ Hotel DB ]
       |------[ Car Service ]------[ Car DB ]
```

---

## ⚙ Approach 1: Two-Phase Commit (2PC)

**2PC Workflow:**
```
User Request
   |
   v
[Transaction Coordinator]
   |--- PREPARE ---> Flight Service (Reserve Seat)
   |--- PREPARE ---> Hotel Service (Reserve Room)
   |--- PREPARE ---> Car Service (Reserve Car)
   <--- VOTE YES/NO from all ---
   |--- COMMIT/ABORT ---> All Services
```

### How It Works:
1. **Prepare Phase**  
   - Services tentatively reserve resources in a “prepared” state.
   - Respond with `"Yes"` or `"No"` to the coordinator.
2. **Commit Phase**  
   - If all `"Yes"`, commit final bookings.
   - If any `"No"`, abort and release resources.

### Problems with 2PC:
- **Blocking**: Services lock resources until commit.
- **Single Point of Failure**: Coordinator crash halts all transactions.
- **Latency**: Two network round-trips per transaction.
- **Poor Partition Tolerance**: Network partitions cause indefinite blocking.

---

## ⚙ Approach 2: Saga Pattern

The Saga Pattern breaks the transaction into **local transactions**, each with a **compensating action**.

---

### Orchestration Saga
```
[Saga Orchestrator]
   |
   |--> Flight Service (Book Flight)
   |        |
   |        v
   |   [If Fail → Cancel Flight]
   |
   |--> Hotel Service (Reserve Room)
   |        |
   |        v
   |   [If Fail → Cancel Hotel + Cancel Flight]
   |
   |--> Car Service (Book Car)
            |
            v
       [If Fail → Cancel Car + Cancel Hotel + Cancel Flight]
```

---

### Choreography Saga
```
Flight Service ---emit---> "FlightBooked" event
   |
Hotel Service ---listen---> Reserve room ---emit---> "HotelReserved"
   |
Car Service ---listen---> Book car ---emit---> "CarBooked"
```

---

## 🔄 Compensating Actions

- Flight booked → Cancel flight
- Hotel reserved → Cancel hotel
- Car booked → Cancel car

Example: If the Car Service fails after booking flight and hotel, previous bookings are rolled back via compensations.

---

## 🛡 Reliability Considerations

- **Idempotency**: All booking and cancellation endpoints must handle retries without side effects.
- **Partial Failures**: Use retries with exponential backoff for transient issues.
- **Messaging Guarantees**: For choreography, ensure *at-least-once* delivery with deduplication.

---

## 📊 Comparison Table

| Feature                 | 2PC                          | Saga (Orchestration)       | Saga (Choreography)         |
|-------------------------|------------------------------|----------------------------|-----------------------------|
| Consistency             | Strong                       | Eventual                   | Eventual                    |
| Availability            | Low under failures           | High                       | High                        |
| Partition Tolerance     | Weak                         | Stronger                   | Stronger                    |
| Complexity              | Moderate                     | Moderate                   | High                        |
| Scalability             | Limited by coordinator       | Good                       | Excellent                   |

---

## ✅ Recommendation

For this travel booking platform:
- **Choose Saga Pattern (Choreography)** for high availability, scalability, and resilience.
- Use Orchestration if simplicity is more important than full decentralization.

**When to use 2PC:**
- Shared database, single data center, strong consistency requirements, low failure rates.

---

## 📌 Conclusion

By adopting the Saga Pattern with reliable event-driven messaging and robust compensations, the system can:
- Stay **highly available**
- Remain **fault-tolerant**
- Scale across regions without global locks

---

## 🖼 Potential Diagram Additions
In a visual blog or documentation, include:
- Sequence diagram for **2PC**
- Event flow diagram for **Saga Orchestration**
- Event bus diagram for **Saga Choreography**
