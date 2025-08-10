---
slug: distributed-transactions-2pc-saga-pattern
title: "The Great Travel Booking Disaster: How 2PC Nearly Killed Our Business and Saga Pattern Saved It"
excerpt: "A tale of distributed transactions gone wrong and the architectural patterns that brought resilience to global travel bookings."
cover: "/blueprints/distributed-transactions-travel-booking.png"
date: "2025-08-04"
tags: ["Distributed Transactions", "Two Phase Commit", "Saga Pattern", "Microservices", "Travel Booking", "System Design"]
---

## Understanding the Problem: When Dreams Meet Distributed Reality

Meet **Alex Chen**, CTO of **WonderTravel**, a rapidly growing online travel platform that promises "seamless one-click vacation bookings" to millions of customers worldwide. The company's ambitious vision: book flights, hotels, and car rentals in a single atomic transaction, ensuring customers never face the nightmare of partial bookings—like having a hotel reservation in Tokyo but no flight to get there.

It's Black Friday 2024, and WonderTravel expects their biggest sales day ever. At 12:01 AM EST, disaster strikes. Their distributed transaction system, built on Two-Phase Commit (2PC), begins failing catastrophically under load. Customers see flights booked but hotels failing, or worse—credit cards charged with no reservations at all.

**The Crisis Numbers:**
- **50,000 simultaneous booking attempts** during peak hour
- **3 independent microservices** across different continents
- **Flight Service**: US-East (New York) - 200ms average response
- **Hotel Service**: Europe (Amsterdam) - 180ms average response  
- **Car Service**: Asia-Pacific (Singapore) - 300ms average response
- **Network failures**: 0.1% packet loss between regions
- **Service crashes**: 2-3 instances per hour during peak load

**Our Mission:** Design a bulletproof distributed transaction system that maintains atomicity across microservices while surviving network partitions, service failures, and the chaos of global scale.

---

## The Distributed Transaction Challenge: The ACID Test

**WonderTravel's Booking Architecture:**
```
Customer Journey:
1. Select flight: JFK → NRT (Japan Airlines, $1,200)
2. Choose hotel: Tokyo Grand Hotel (3 nights, $450/night)
3. Pick rental: Toyota Camry (3 days, $80/day)
4. Click "Book Everything" → Must be atomic!

System Architecture:

[Flight Service] (US-East) ---> PostgreSQL (Seats DB)
[Hotel Service] (Europe) ---> MongoDB (Rooms DB)
[Car Service] (Asia-Pacific) ---> MySQL (Cars DB)
```

**The Atomic Requirement:**
- **Success Case**: All three services must successfully reserve resources
- **Failure Case**: If ANY service fails, ALL reservations must be rolled back
- **Consistency**: No partial bookings should ever exist
- **Isolation**: Concurrent bookings shouldn't interfere with each other
- **Durability**: Confirmed bookings must survive system failures

---

## Attempt #1: Two-Phase Commit (2PC) - The "Obvious" Choice

### How 2PC Works: The Coordinator's Dance

Two-Phase Commit implements distributed atomicity through a **coordinator** that orchestrates a two-stage process across all **participants**.

```
sequenceDiagram
    participant C as Coordinator
    participant F as Flight Service
    participant H as Hotel Service
    participant R as Car Service
    
    Note over C: Phase 1: PREPARE
    C->>F: PREPARE: Reserve JFK→NRT flight
    C->>H: PREPARE: Reserve Tokyo hotel room
    C->>R: PREPARE: Reserve Toyota Camry
    
    F->>C: PREPARED (flight locked)
    H->>C: PREPARED (room locked)  
    R->>C: PREPARED (car locked)
    
    Note over C: All services ready!
    Note over C: Phase 2: COMMIT
    
    C->>F: COMMIT: Finalize flight booking
    C->>H: COMMIT: Finalize hotel reservation
    C->>R: COMMIT: Finalize car rental
    
    F->>C: COMMITTED
    H->>C: COMMITTED
    R->>C: COMMITTED
    
    Note over C: Success! All bookings confirmed
```

### WonderTravel's 2PC Implementation

```
import asyncio
import logging
from enum import Enum
from dataclasses import dataclass
from typing import Dict, List, Optional
import uuid

class TransactionState(Enum):
    INITIATED = "initiated"
    PREPARED = "prepared"
    COMMITTED = "committed"
    ABORTED = "aborted"

@dataclass
class BookingRequest:
    flight_details: dict
    hotel_details: dict
    car_details: dict
    customer_id: str
    total_amount: float

@dataclass
class ServiceResponse:
    service_name: str
    transaction_id: str
    success: bool
    resource_id: Optional[str] = None
    error_message: Optional[str] = None

class TwoPCCoordinator:
    """Two-Phase Commit Coordinator for travel bookings"""
    
    def __init__(self):
        self.active_transactions: Dict[str, TransactionState] = {}
        self.service_clients = {
            'flight': FlightServiceClient(),
            'hotel': HotelServiceClient(),
            'car': CarServiceClient()
        }
        self.transaction_log = []
    
    async def book_travel_package(self, booking: BookingRequest) -> dict:
        """Execute distributed travel booking transaction"""
        
        transaction_id = str(uuid.uuid4())
        self.active_transactions[transaction_id] = TransactionState.INITIATED
        
        try:
            # Phase 1: PREPARE - Lock all resources
            prepare_results = await self._phase1_prepare(transaction_id, booking)
            
            if self._all_services_prepared(prepare_results):
                # Phase 2: COMMIT - Finalize all bookings
                commit_results = await self._phase2_commit(transaction_id)
                
                self.active_transactions[transaction_id] = TransactionState.COMMITTED
                return {
                    'success': True,
                    'transaction_id': transaction_id,
                    'bookings': commit_results
                }
            else:
                # Phase 2: ABORT - Release all locks
                abort_results = await self._phase2_abort(transaction_id)
                
                self.active_transactions[transaction_id] = TransactionState.ABORTED
                return {
                    'success': False,
                    'transaction_id': transaction_id,
                    'error': 'One or more services failed to prepare',
                    'details': prepare_results
                }
                
        except Exception as e:
            # Emergency abort on coordinator failure
            await self._emergency_abort(transaction_id)
            raise e
    
    async def _phase1_prepare(self, transaction_id: str, booking: BookingRequest) -> List[ServiceResponse]:
        """Phase 1: Request all services to prepare (lock resources)"""
        
        logging.info(f"Starting Phase 1 PREPARE for transaction {transaction_id}")
        
        # Prepare requests for all services
        prepare_tasks = [
            self.service_clients['flight'].prepare(transaction_id, booking.flight_details),
            self.service_clients['hotel'].prepare(transaction_id, booking.hotel_details), 
            self.service_clients['car'].prepare(transaction_id, booking.car_details)
        ]
        
        # Execute all prepare operations in parallel with timeout
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*prepare_tasks, return_exceptions=True),
                timeout=30.0  # 30 second timeout for prepare phase
            )
            
            # Process results and handle exceptions
            responses = []
            for i, result in enumerate(results):
                service_name = ['flight', 'hotel', 'car'][i]
                
                if isinstance(result, Exception):
                    responses.append(ServiceResponse(
                        service_name=service_name,
                        transaction_id=transaction_id,
                        success=False,
                        error_message=str(result)
                    ))
                else:
                    responses.append(result)
            
            # Log prepare phase results
            self._log_transaction_phase(transaction_id, "PREPARE", responses)
            return responses
            
        except asyncio.TimeoutError:
            logging.error(f"Phase 1 PREPARE timeout for transaction {transaction_id}")
            # Timeout handling - abort transaction
            await self._emergency_abort(transaction_id)
            raise Exception("Prepare phase timeout - transaction aborted")
    
    async def _phase2_commit(self, transaction_id: str) -> List[ServiceResponse]:
        """Phase 2: Request all services to commit (finalize bookings)"""
        
        logging.info(f"Starting Phase 2 COMMIT for transaction {transaction_id}")
        
        commit_tasks = [
            self.service_clients['flight'].commit(transaction_id),
            self.service_clients['hotel'].commit(transaction_id),
            self.service_clients['car'].commit(transaction_id)
        ]
        
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*commit_tasks, return_exceptions=True),
                timeout=60.0  # Longer timeout for commit phase
            )
            
            # Process commit results
            responses = []
            for i, result in enumerate(results):
                service_name = ['flight', 'hotel', 'car'][i]
                
                if isinstance(result, Exception):
                    # CRITICAL: Commit phase failure is catastrophic!
                    logging.critical(f"COMMIT FAILED for {service_name} in transaction {transaction_id}: {result}")
                    responses.append(ServiceResponse(
                        service_name=service_name,
                        transaction_id=transaction_id, 
                        success=False,
                        error_message=f"COMMIT_FAILURE: {result}"
                    ))
                else:
                    responses.append(result)
            
            self._log_transaction_phase(transaction_id, "COMMIT", responses)
            return responses
            
        except asyncio.TimeoutError:
            # Commit timeout is DISASTER - some services may have committed!
            logging.critical(f"Phase 2 COMMIT timeout for transaction {transaction_id} - INCONSISTENT STATE!")
            raise Exception("Commit phase timeout - system may be in inconsistent state")
    
    async def _phase2_abort(self, transaction_id: str) -> List[ServiceResponse]:
        """Phase 2: Request all services to abort (release locks)"""
        
        logging.info(f"Starting Phase 2 ABORT for transaction {transaction_id}")
        
        abort_tasks = [
            self.service_clients['flight'].abort(transaction_id),
            self.service_clients['hotel'].abort(transaction_id),
            self.service_clients['car'].abort(transaction_id)
        ]
        
        # Abort operations should be best-effort
        results = await asyncio.gather(*abort_tasks, return_exceptions=True)
        
        responses = []
        for i, result in enumerate(results):
            service_name = ['flight', 'hotel', 'car'][i]
            
            if isinstance(result, Exception):
                logging.warning(f"Abort failed for {service_name}: {result}")
                responses.append(ServiceResponse(
                    service_name=service_name,
                    transaction_id=transaction_id,
                    success=False,
                    error_message=f"ABORT_FAILED: {result}"
                ))
            else:
                responses.append(result)
        
        self._log_transaction_phase(transaction_id, "ABORT", responses)
        return responses
    
    def _all_services_prepared(self, responses: List[ServiceResponse]) -> bool:
        """Check if all services successfully prepared"""
        return all(response.success for response in responses)
    
    def _log_transaction_phase(self, transaction_id: str, phase: str, responses: List[ServiceResponse]):
        """Log transaction phase for recovery purposes"""
        log_entry = {
            'transaction_id': transaction_id,
            'phase': phase,
            'timestamp': asyncio.get_event_loop().time(),
            'responses': [
                {
                    'service': r.service_name,
                    'success': r.success,
                    'error': r.error_message
                } for r in responses
            ]
        }
        self.transaction_log.append(log_entry)
        
        # Persistent logging for recovery
        logging.info(f"Transaction {transaction_id} {phase}: {log_entry}")

# Flight Service Implementation
class FlightServiceClient:
    def __init__(self):
        self.prepared_reservations: Dict[str, dict] = {}
        self.committed_bookings: Dict[str, dict] = {}
    
    async def prepare(self, transaction_id: str, flight_details: dict) -> ServiceResponse:
        """Prepare phase: Lock flight seat without finalizing booking"""
        
        try:
            # Simulate network latency and occasional failures
            await asyncio.sleep(0.2)  # 200ms base latency
            
            # Simulate 5% failure rate during peak load
            import random
            if random.random() < 0.05:
                raise Exception("Flight service temporarily unavailable")
            
            # Check seat availability
            if not await self._check_seat_availability(flight_details['flight_id'], flight_details['seat_class']):
                return ServiceResponse(
                    service_name='flight',
                    transaction_id=transaction_id,
                    success=False,
                    error_message="Requested seat not available"
                )
            
            # Reserve seat temporarily (with timeout lock)
            reservation = {
                'flight_id': flight_details['flight_id'],
                'seat_class': flight_details['seat_class'],
                'passenger_count': flight_details['passenger_count'],
                'price': flight_details['price'],
                'reserved_at': asyncio.get_event_loop().time()
            }
            
            self.prepared_reservations[transaction_id] = reservation
            
            # Set timeout for reservation (auto-release after 5 minutes)
            asyncio.create_task(self._auto_release_reservation(transaction_id, 300))
            
            return ServiceResponse(
                service_name='flight',
                transaction_id=transaction_id,
                success=True,
                resource_id=f"flight_{flight_details['flight_id']}"
            )
            
        except Exception as e:
            return ServiceResponse(
                service_name='flight',
                transaction_id=transaction_id,
                success=False,
                error_message=str(e)
            )
    
    async def commit(self, transaction_id: str) -> ServiceResponse:
        """Commit phase: Finalize flight booking"""
        
        if transaction_id not in self.prepared_reservations:
            return ServiceResponse(
                service_name='flight',
                transaction_id=transaction_id,
                success=False,
                error_message="No prepared reservation found"
            )
        
        try:
            # Move from prepared to committed
            reservation = self.prepared_reservations.pop(transaction_id)
            self.committed_bookings[transaction_id] = reservation
            
            # Generate booking confirmation
            booking_reference = f"FL{transaction_id[:8].upper()}"
            
            return ServiceResponse(
                service_name='flight',
                transaction_id=transaction_id,
                success=True,
                resource_id=booking_reference
            )
            
        except Exception as e:
            return ServiceResponse(
                service_name='flight',
                transaction_id=transaction_id,
                success=False,
                error_message=f"Commit failed: {e}"
            )
    
    async def abort(self, transaction_id: str) -> ServiceResponse:
        """Abort phase: Release reserved seat"""
        
        if transaction_id in self.prepared_reservations:
            del self.prepared_reservations[transaction_id]
        
        return ServiceResponse(
            service_name='flight',
            transaction_id=transaction_id,
            success=True
        )
    
    async def _check_seat_availability(self, flight_id: str, seat_class: str) -> bool:
        """Check if seats are available for booking"""
        # Simulate database query
        await asyncio.sleep(0.05)
        return True  # Simplified - assume seats available
    
    async def _auto_release_reservation(self, transaction_id: str, timeout_seconds: int):
        """Auto-release reservation after timeout"""
        await asyncio.sleep(timeout_seconds)
        
        if transaction_id in self.prepared_reservations:
            logging.warning(f"Auto-releasing expired reservation {transaction_id}")
            del self.prepared_reservations[transaction_id]
```

---

## The Black Friday Disaster: When 2PC Goes Wrong

### Scenario 1: The Coordinator Crashes

**The Incident:** At 12:15 AM, the 2PC coordinator service crashes due to memory exhaustion during peak load. **2,000 transactions** are left in prepared state.

```
Current State at Crash:

[Flight Service] ---> 2,000 seats (LOCKED, awaiting coordinator)
[Hotel Service] ---> 2,000 rooms (LOCKED, awaiting coordinator)
[Car Service] ---> 2,000 cars (LOCKED, awaiting coordinator)

[Coordinator] ☠️ CRASHED ☠️
```
**The Problem:** All services are blocked, waiting for commit/abort decisions that will never come.

**Customer Impact:**
- **2,000 customers** can't book travel packages (resources locked but not confirmed)
- **6,000 inventory items** unusable until manual intervention
- **Revenue loss**: $2.4M in blocked bookings
- **Recovery time**: 4 hours to manually identify and unlock resources

### Scenario 2: Network Partitions During Commit

**The Incident:** A network partition splits the coordinator from the Hotel Service during the commit phase.

```
sequenceDiagram
    participant C as Coordinator
    participant F as Flight Service  
    participant H as Hotel Service
    participant R as Car Service
    
    C->>F: COMMIT
    C->>H: COMMIT (NETWORK FAILURE!)
    C->>R: COMMIT
    
    F->>C: COMMITTED ✅
    Note over H: Network partition!<br/>Never receives COMMIT
    R->>C: COMMITTED ✅
    
    Note over C: 2/3 services committed<br/>What about Hotel?
    Note over H: Still waiting for decision<br/>Resources locked indefinitely
```

**The Disaster:**
- **Flight**: ✅ Booked and charged customer
- **Hotel**: ❓ Locked but not confirmed  
- **Car**: ✅ Booked and charged customer
- **Customer**: Has flight and car, but no hotel!
- **System State**: Inconsistent and corrupted

---

## Why 2PC Fails in Microservices: The Fundamental Problems

### Problem 1: Blocking and Availability

```
class ProblematicBlockingScenario:
    """Demonstration of 2PC blocking issues"""
    
    def __init__(self):
        self.blocked_transactions = {}
        self.resource_locks = {}
    
    def simulate_coordinator_failure(self, active_transactions: List[str]):
        """What happens when coordinator dies"""
        
        for transaction_id in active_transactions:
            # All resources remain locked indefinitely
            self.resource_locks[transaction_id] = {
                'flight_seats': 'LOCKED',
                'hotel_rooms': 'LOCKED', 
                'rental_cars': 'LOCKED',
                'locked_since': time.time(),
                'can_proceed': False,  # ❌ BLOCKED!
                'requires_manual_intervention': True
            }
        
        # System statistics during blocking
        total_locked_resources = sum(
            len(locks) for locks in self.resource_locks.values()
        )
        
        return {
            'blocked_transactions': len(active_transactions),
            'locked_resources': total_locked_resources,
            'system_availability': 0,  # ❌ System effectively down
            'customer_impact': 'SEVERE',
            'recovery_method': 'MANUAL_INTERVENTION_REQUIRED'
        }

# Real blocking statistics from WonderTravel
blocking_stats = {
    'average_transaction_duration': 1200,  # 20 minutes (prepare + commit)
    'resources_locked_per_transaction': 3,
    'concurrent_transactions_peak': 50000,
    'total_resources_at_risk': 150000,  # 50k × 3 resources
    'coordinator_uptime': 99.5,  # 99.5% uptime = 4.38 hours downtime/month
    'blocked_customers_per_outage': 25000,  # Customers affected during coordinator crash
}
```

### Problem 2: CAP Theorem Violations

**WonderTravel's CAP Analysis:**

```
CAP Theorem Trade-offs in 2PC:

Consistency (C): ✅ STRONG
- All services see the same data
- No partial bookings exist
- ACID guarantees maintained

Availability (A): ❌ POOR
- System blocks during network partitions
- Coordinator failures cause total outages
- Services can't make progress independently

Partition Tolerance (P): ❌ POOR  
- Network splits cause indefinite blocking
- Cannot distinguish between slow network and crashed node
- Manual intervention required for recovery
```

### Problem 3: Performance Degradation

```
class PerformanceAnalysis:
    """2PC Performance characteristics under load"""
    
    def __init__(self):
        self.latency_measurements = []
        self.throughput_measurements = []
    
    def measure_2pc_performance(self, concurrent_transactions: int) -> dict:
        """Measure 2PC performance under various loads"""
        
        # Base latencies for each service
        base_latencies = {
            'flight_service': 200,   # ms
            'hotel_service': 180,    # ms  
            'car_service': 300       # ms
        }
        
        # 2PC adds coordination overhead
        coordination_overhead = 150  # ms per phase
        network_roundtrips = 2       # prepare + commit phases
        
        # Calculate total transaction time
        max_service_latency = max(base_latencies.values())
        total_transaction_time = (
            (max_service_latency + coordination_overhead) * network_roundtrips
        )
        
        # Throughput degradation with locks
        lock_contention_factor = 1 + (concurrent_transactions / 1000)
        effective_throughput = 1000 / lock_contention_factor  # TPS
        
        # Failure amplification
        individual_failure_rate = 0.01  # 1% per service
        combined_failure_rate = 1 - ((1 - individual_failure_rate) ** 3)  # ~3%
        
        return {
            'transaction_latency_ms': total_transaction_time * lock_contention_factor,
            'throughput_tps': effective_throughput,
            'failure_rate': combined_failure_rate,
            'availability': 1 - combined_failure_rate,
            'resource_utilization': concurrent_transactions / 10000 * 100,
            'coordinator_bottleneck': True
        }

# Performance comparison
low_load = PerformanceAnalysis().measure_2pc_performance(1000)
high_load = PerformanceAnalysis().measure_2pc_performance(50000)

print("2PC Performance Analysis:")
print(f"Low Load (1K concurrent): {low_load['transaction_latency_ms']:.0f}ms, {low_load['throughput_tps']:.0f} TPS")
print(f"High Load (50K concurrent): {high_load['transaction_latency_ms']:.0f}ms, {high_load['throughput_tps']:.0f} TPS")
print(f"Performance degradation: {high_load['transaction_latency_ms'] / low_load['transaction_latency_ms']:.1f}x slower")
```

---

## The Saga Pattern: Choreographed Resilience

### Understanding Saga: The Netflix Model

After the 2PC disaster, Alex's team discovered the **Saga Pattern**—a way to manage distributed transactions without blocking or coordinators. Instead of locking resources and coordinating commits, Saga breaks the transaction into a sequence of **local transactions**, each with a corresponding **compensating action**.

**Core Saga Principles:**
- **No locks**: Each service commits immediately to its local database
- **Compensating actions**: For every action, define how to undo it
- **Event-driven**: Services communicate through events, not direct calls
- **Eventually consistent**: System reaches consistency over time, not immediately

```
Traditional 2PC Flow:
1. Lock flight → Lock hotel → Lock car
2. Commit flight → Commit hotel → Commit car
❌ Problem: If ANY step fails, ALL are blocked

Saga Pattern Flow:
1. Book flight ✅ → Publish "FlightBooked" event
2. Book hotel ✅ → Publish "HotelBooked" event  
3. Book car ✅ → Publish "CarBooked" event
✅ Success: All booked independently

Failure Scenario:
1. Book flight ✅ → Publish "FlightBooked" event
2. Book hotel ✅ → Publish "HotelBooked" event
3. Book car ❌ → Publish "CarBookingFailed" event
4. Cancel hotel ✅ → Publish "HotelCancelled" event
5. Cancel flight ✅ → Publish "FlightCancelled" event
✅ Recovery: System self-heals through compensation
```

### Orchestration vs Choreography: Two Saga Styles

#### Option 1: Orchestrated Saga (Centralized)

```
class TravelBookingSagaOrchestrator:
    """Centralized orchestrator managing booking workflow"""
    
    def __init__(self):
        self.event_store = EventStore()
        self.service_clients = {
            'flight': FlightServiceClient(),
            'hotel': HotelServiceClient(),
            'car': CarServiceClient()
        }
        self.compensation_handlers = {
            'flight': self._compensate_flight_booking,
            'hotel': self._compensate_hotel_booking,  
            'car': self._compensate_car_booking
        }
    
    async def execute_travel_booking_saga(self, booking_request: BookingRequest) -> dict:
        """Execute travel booking saga with orchestration"""
        
        saga_id = str(uuid.uuid4())
        saga_state = SagaState(saga_id, booking_request)
        
        try:
            # Step 1: Book Flight
            saga_state.current_step = "booking_flight"
            flight_result = await self._execute_step_with_retry(
                self.service_clients['flight'].book_flight,
                booking_request.flight_details,
                saga_state
            )
            
            if not flight_result.success:
                return await self._handle_saga_failure(saga_state, "flight_booking_failed")
            
            saga_state.completed_steps.append({
                'step': 'flight_booking',
                'result': flight_result,
                'compensation_required': True
            })
            
            # Step 2: Book Hotel  
            saga_state.current_step = "booking_hotel"
            hotel_result = await self._execute_step_with_retry(
                self.service_clients['hotel'].book_hotel,
                booking_request.hotel_details,
                saga_state
            )
            
            if not hotel_result.success:
                return await self._handle_saga_failure(saga_state, "hotel_booking_failed")
            
            saga_state.completed_steps.append({
                'step': 'hotel_booking',
                'result': hotel_result,
                'compensation_required': True
            })
            
            # Step 3: Book Car
            saga_state.current_step = "booking_car"
            car_result = await self._execute_step_with_retry(
                self.service_clients['car'].book_car,
                booking_request.car_details,
                saga_state
            )
            
            if not car_result.success:
                return await self._handle_saga_failure(saga_state, "car_booking_failed")
            
            saga_state.completed_steps.append({
                'step': 'car_booking',
                'result': car_result,
                'compensation_required': True
            })
            
            # Success: All bookings completed
            saga_state.status = SagaStatus.COMPLETED
            await self._persist_saga_state(saga_state)
            
            return {
                'success': True,
                'saga_id': saga_id,
                'bookings': {
                    'flight': flight_result.booking_id,
                    'hotel': hotel_result.booking_id,
                    'car': car_result.booking_id
                },
                'total_amount': booking_request.total_amount
            }
            
        except Exception as e:
            logging.error(f"Saga {saga_id} failed with exception: {e}")
            return await self._handle_saga_failure(saga_state, f"unexpected_error: {e}")
    
    async def _handle_saga_failure(self, saga_state: SagaState, reason: str) -> dict:
        """Handle saga failure by executing compensating actions"""
        
        logging.warning(f"Saga {saga_state.saga_id} failed: {reason}")
        saga_state.status = SagaStatus.COMPENSATING
        saga_state.failure_reason = reason
        
        # Execute compensating actions in reverse order
        compensation_results = []
        
        for step in reversed(saga_state.completed_steps):
            if step['compensation_required']:
                try:
                    compensation_result = await self._execute_compensation(
                        step['step'], 
                        step['result'],
                        saga_state
                    )
                    compensation_results.append(compensation_result)
                    
                except Exception as e:
                    logging.error(f"Compensation failed for {step['step']}: {e}")
                    # Continue with other compensations even if one fails
                    compensation_results.append({
                        'step': step['step'],
                        'success': False,
                        'error': str(e)
                    })
        
        saga_state.status = SagaStatus.COMPENSATED
        await self._persist_saga_state(saga_state)
        
        return {
            'success': False,
            'saga_id': saga_state.saga_id,
            'reason': reason,
            'compensations': compensation_results
        }
    
    async def _execute_step_with_retry(self, step_function, params, saga_state, max_retries=3):
        """Execute saga step with exponential backoff retry"""
        
        for attempt in range(max_retries):
            try:
                result = await step_function(params)
                
                # Log successful step
                await self._log_saga_event(
                    saga_state.saga_id,
                    f"{saga_state.current_step}_success",
                    {'attempt': attempt + 1, 'result': result.__dict__}
                )
                
                return result
                
            except Exception as e:
                wait_time = (2 ** attempt) * 1.0  # Exponential backoff
                
                if attempt < max_retries - 1:
                    logging.warning(f"Step {saga_state.current_step} failed (attempt {attempt + 1}): {e}. Retrying in {wait_time}s")
                    await asyncio.sleep(wait_time)
                else:
                    logging.error(f"Step {saga_state.current_step} failed after {max_retries} attempts: {e}")
                    raise e
    
    async def _execute_compensation(self, step_name: str, step_result, saga_state):
        """Execute compensating action for a completed step"""
        
        compensation_function = self.compensation_handlers.get(step_name.split('_'))
        
        if compensation_function:
            return await compensation_function(step_result, saga_state)
        else:
            logging.warning(f"No compensation handler found for step: {step_name}")
            return {'success': False, 'error': 'No compensation handler'}
    
    async def _compensate_flight_booking(self, flight_result, saga_state):
        """Compensate flight booking by cancelling reservation"""
        
        try:
            cancellation_result = await self.service_clients['flight'].cancel_booking(
                flight_result.booking_id
            )
            
            await self._log_saga_event(
                saga_state.saga_id,
                "flight_booking_compensated",
                {'booking_id': flight_result.booking_id, 'result': cancellation_result.__dict__}
            )
            
            return {
                'step': 'flight_compensation',
                'success': cancellation_result.success,
                'booking_id': flight_result.booking_id
            }
            
        except Exception as e:
            logging.error(f"Flight compensation failed: {e}")
            return {
                'step': 'flight_compensation',
                'success': False,
                'error': str(e)
            }
    
    async def _compensate_hotel_booking(self, hotel_result, saga_state):
        """Compensate hotel booking by cancelling reservation"""
        # Similar implementation to flight compensation
        pass
    
    async def _compensate_car_booking(self, car_result, saga_state):
        """Compensate car booking by cancelling reservation"""
        # Similar implementation to flight compensation  
        pass

@dataclass
class SagaState:
    saga_id: str
    booking_request: BookingRequest
    status: SagaStatus = SagaStatus.STARTED
    current_step: str = ""
    completed_steps: List[dict] = None
    failure_reason: str = ""
    
    def __post_init__(self):
        if self.completed_steps is None:
            self.completed_steps = []

class SagaStatus(Enum):
    STARTED = "started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    COMPENSATING = "compensating"
    COMPENSATED = "compensated"
    FAILED = "failed"
```

#### Option 2: Choreographed Saga (Decentralized)

```
class ChoreographedTravelBookingSaga:
    """Event-driven choreographed saga without central orchestrator"""
    
    def __init__(self):
        self.event_bus = EventBus()
        self.saga_repository = SagaRepository()
        self.event_handlers = {
            'TravelBookingRequested': self._handle_travel_booking_requested,
            'FlightBooked': self._handle_flight_booked,
            'FlightBookingFailed': self._handle_flight_booking_failed,
            'HotelBooked': self._handle_hotel_booked,
            'HotelBookingFailed': self._handle_hotel_booking_failed,
            'CarBooked': self._handle_car_booked,
            'CarBookingFailed': self._handle_car_booking_failed,
        }
        
        # Subscribe to all relevant events
        for event_type, handler in self.event_handlers.items():
            self.event_bus.subscribe(event_type, handler)
    
    async def start_travel_booking_saga(self, booking_request: BookingRequest) -> str:
        """Start choreographed saga by publishing initial event"""
        
        saga_id = str(uuid.uuid4())
        
        # Create saga state
        saga_state = ChoreographedSagaState(
            saga_id=saga_id,
            booking_request=booking_request,
            status='STARTED'
        )
        
        await self.saga_repository.save_saga_state(saga_state)
        
        # Publish initial event to start the saga
        await self.event_bus.publish(Event(
            type='TravelBookingRequested',
            saga_id=saga_id,
            data={
                'booking_request': booking_request.__dict__,
                'timestamp': time.time()
            }
        ))
        
        return saga_id
    
    async def _handle_travel_booking_requested(self, event: Event):
        """Handle initial travel booking request"""
        
        saga_state = await self.saga_repository.get_saga_state(event.saga_id)
        
        # Start with flight booking
        await self.event_bus.publish(Event(
            type='BookFlightRequested',
            saga_id=event.saga_id,
            data={
                'flight_details': saga_state.booking_request.flight_details,
                'saga_context': {
                    'next_steps': ['book_hotel', 'book_car'],
                    'compensation_stack': []
                }
            }
        ))
    
    async def _handle_flight_booked(self, event: Event):
        """Handle successful flight booking"""
        
        saga_state = await self.saga_repository.get_saga_state(event.saga_id)
        
        # Update saga state
        saga_state.flight_booking = event.data['booking_details']
        saga_state.compensation_stack.append('cancel_flight')
        
        await self.saga_repository.save_saga_state(saga_state)
        
        # Trigger next step: hotel booking
        await self.event_bus.publish(Event(
            type='BookHotelRequested',
            saga_id=event.saga_id,
            data={
                'hotel_details': saga_state.booking_request.hotel_details,
                'saga_context': {
                    'next_steps': ['book_car'],
                    'compensation_stack': saga_state.compensation_stack
                }
            }
        ))
    
    async def _handle_flight_booking_failed(self, event: Event):
        """Handle flight booking failure"""
        
        saga_state = await self.saga_repository.get_saga_state(event.saga_id)
        saga_state.status = 'FAILED'
        saga_state.failure_reason = 'Flight booking failed'
        
        await self.saga_repository.save_saga_state(saga_state)
        
        # No compensations needed since flight was the first step
        await self.event_bus.publish(Event(
            type='TravelBookingSagaFailed',
            saga_id=event.saga_id,
            data={
                'reason': 'Flight booking failed',
                'compensations_completed': []
            }
        ))
    
    async def _handle_hotel_booked(self, event: Event):
        """Handle successful hotel booking"""
        
        saga_state = await self.saga_repository.get_saga_state(event.saga_id)
        
        # Update saga state
        saga_state.hotel_booking = event.data['booking_details']
        saga_state.compensation_stack.append('cancel_hotel')
        
        await self.saga_repository.save_saga_state(saga_state)
        
        # Trigger final step: car booking
        await self.event_bus.publish(Event(
            type='BookCarRequested',
            saga_id=event.saga_id,
            data={
                'car_details': saga_state.booking_request.car_details,
                'saga_context': {
                    'next_steps': [],  # Final step
                    'compensation_stack': saga_state.compensation_stack
                }
            }
        ))
    
    async def _handle_hotel_booking_failed(self, event: Event):
        """Handle hotel booking failure - trigger compensation"""
        
        saga_state = await self.saga_repository.get_saga_state(event.saga_id)
        saga_state.status = 'COMPENSATING'
        
        await self.saga_repository.save_saga_state(saga_state)
        
        # Start compensation process
        await self._execute_compensation_chain(event.saga_id, saga_state.compensation_stack)
    
    async def _handle_car_booked(self, event: Event):
        """Handle successful car booking - saga completion"""
        
        saga_state = await self.saga_repository.get_saga_state(event.saga_id)
        
        # Update saga state
        saga_state.car_booking = event.data['booking_details']
        saga_state.status = 'COMPLETED'
        
        await self.saga_repository.save_saga_state(saga_state)
        
        # Publish saga completion event
        await self.event_bus.publish(Event(
            type='TravelBookingSagaCompleted',
            saga_id=event.saga_id,
            data={
                'bookings': {
                    'flight': saga_state.flight_booking,
                    'hotel': saga_state.hotel_booking,
                    'car': saga_state.car_booking
                },
                'completion_time': time.time()
            }
        ))
    
    async def _handle_car_booking_failed(self, event: Event):
        """Handle car booking failure - trigger compensation"""
        
        saga_state = await self.saga_repository.get_saga_state(event.saga_id)
        saga_state.status = 'COMPENSATING'
        
        await self.saga_repository.save_saga_state(saga_state)
        
        # Start compensation for flight and hotel
        await self._execute_compensation_chain(event.saga_id, saga_state.compensation_stack)
    
    async def _execute_compensation_chain(self, saga_id: str, compensation_stack: List[str]):
        """Execute compensation actions in reverse order"""
        
        for compensation_action in reversed(compensation_stack):
            await self.event_bus.publish(Event(
                type=f'{compensation_action.title()}Requested',
                saga_id=saga_id,
                data={
                    'reason': 'saga_compensation',
                    'timestamp': time.time()
                }
            ))
            
            # Add delay between compensations to avoid overwhelming services
            await asyncio.sleep(0.1)

@dataclass
class ChoreographedSagaState:
    saga_id: str
    booking_request: BookingRequest
    status: str
    flight_booking: Optional[dict] = None
    hotel_booking: Optional[dict] = None
    car_booking: Optional[dict] = None
    compensation_stack: List[str] = None
    failure_reason: str = ""
    
    def __post_init__(self):
        if self.compensation_stack is None:
            self.compensation_stack = []
```

---

## Handling Partial Failures and Idempotency

### The Idempotency Challenge

```
class IdempotentServiceOperation:
    """Ensure operations can be safely retried without side effects"""
    
    def __init__(self):
        self.operation_log = {}  # In production: use Redis or database
        self.booking_repository = BookingRepository()
    
    async def idempotent_flight_booking(self, booking_request: dict, idempotency_key: str) -> dict:
        """Book flight with idempotency guarantees"""
        
        # Check if operation already completed
        if idempotency_key in self.operation_log:
            cached_result = self.operation_log[idempotency_key]
            
            if cached_result['status'] == 'COMPLETED':
                logging.info(f"Returning cached result for idempotency key {idempotency_key}")
                return cached_result['result']
            elif cached_result['status'] == 'IN_PROGRESS':
                # Operation in progress - return appropriate response
                return {
                    'success': False,
                    'error': 'Operation in progress',
                    'retry_after': 5
                }
        
        # Mark operation as in progress
        self.operation_log[idempotency_key] = {
            'status': 'IN_PROGRESS',
            'started_at': time.time(),
            'request': booking_request
        }
        
        try:
            # Check if booking already exists (database-level idempotency)
            existing_booking = await self.booking_repository.find_by_request_hash(
                self._hash_booking_request(booking_request)
            )
            
            if existing_booking:
                result = {
                    'success': True,
                    'booking_id': existing_booking.booking_id,
                    'amount': existing_booking.amount,
                    'status': 'already_exists'
                }
            else:
                # Perform actual booking
                result = await self._perform_flight_booking(booking_request)
            
            # Cache successful result
            self.operation_log[idempotency_key] = {
                'status': 'COMPLETED',
                'result': result,
                'completed_at': time.time()
            }
            
            return result
            
        except Exception as e:
            # Remove from operation log on failure (allows retry)
            if idempotency_key in self.operation_log:
                del self.operation_log[idempotency_key]
            
            logging.error(f"Flight booking failed for idempotency key {idempotency_key}: {e}")
            raise e
    
    async def idempotent_flight_cancellation(self, booking_id: str, idempotency_key: str) -> dict:
        """Cancel flight booking idempotently"""
        
        # Check cache
        if idempotency_key in self.operation_log:
            cached_result = self.operation_log[idempotency_key]
            if cached_result['status'] == 'COMPLETED':
                return cached_result['result']
        
        # Mark as in progress
        self.operation_log[idempotency_key] = {
            'status': 'IN_PROGRESS',
            'started_at': time.time()
        }
        
        try:
            # Check current booking status
            booking = await self.booking_repository.get_booking(booking_id)
            
            if not booking:
                result = {
                    'success': True,
                    'status': 'not_found',
                    'message': 'Booking does not exist (may already be cancelled)'
                }
            elif booking.status == 'CANCELLED':
                result = {
                    'success': True,
                    'status': 'already_cancelled',
                    'cancellation_id': booking.cancellation_id
                }
            else:
                # Perform actual cancellation
                result = await self._perform_flight_cancellation(booking_id)
            
            # Cache result
            self.operation_log[idempotency_key] = {
                'status': 'COMPLETED',
                'result': result,
                'completed_at': time.time()
            }
            
            return result
            
        except Exception as e:
            # Remove from cache on failure
            if idempotency_key in self.operation_log:
                del self.operation_log[idempotency_key]
            raise e
    
    def _hash_booking_request(self, booking_request: dict) -> str:
        """Create deterministic hash of booking request for deduplication"""
        
        # Extract key fields for hashing
        key_fields = {
            'customer_id': booking_request.get('customer_id'),
            'flight_id': booking_request.get('flight_id'),
            'departure_date': booking_request.get('departure_date'),
            'passenger_count': booking_request.get('passenger_count'),
            'seat_class': booking_request.get('seat_class')
        }
        
        # Create deterministic hash
        import hashlib
        import json
        
        key_string = json.dumps(key_fields, sort_keys=True)
        return hashlib.sha256(key_string.encode()).hexdigest()

# Distributed idempotency using Redis
class DistributedIdempotencyManager:
    """Manage idempotency across multiple service instances"""
    
    def __init__(self, redis_client):
        self.redis = redis_client
        self.default_ttl = 86400  # 24 hours
    
    async def with_idempotency(self, operation_func, idempotency_key: str, ttl: int = None):
        """Execute operation with distributed idempotency"""
        
        ttl = ttl or self.default_ttl
        lock_key = f"idempotency:lock:{idempotency_key}"
        result_key = f"idempotency:result:{idempotency_key}"
        
        # Check for cached result first
        cached_result = await self.redis.get(result_key)
        if cached_result:
            return json.loads(cached_result)
        
        # Acquire distributed lock
        lock_acquired = await self.redis.set(lock_key, "locked", ex=300, nx=True)  # 5 min lock
        
        if not lock_acquired:
            # Another instance is processing this operation
            # Poll for result or return "in progress" status
            for _ in range(30):  # Poll for up to 30 seconds
                cached_result = await self.redis.get(result_key)
                if cached_result:
                    return json.loads(cached_result)
                await asyncio.sleep(1)
            
            return {
                'success': False,
                'error': 'Operation timeout - another instance may be processing',
                'retry_after': 60
            }
        
        try:
            # Execute the operation
            result = await operation_func()
            
            # Cache the result
            await self.redis.set(result_key, json.dumps(result), ex=ttl)
            
            return result
            
        finally:
            # Always release the lock
            await self.redis.delete(lock_key)
```

---

## Production Decision: 2PC vs Saga Pattern

### Decision Matrix: When to Choose What

| Factor | 2PC | Saga Pattern | WonderTravel Choice |
|--------|-----|--------------|-------------------|
| **Consistency** | Strong (ACID) | Eventual | **Saga** - eventual OK for travel |
| **Availability** | Poor (blocking) | High | **Saga** - 99.99% availability required |
| **Performance** | Degrades with load | Scales horizontally | **Saga** - handles 50K concurrent |
| **Complexity** | Medium (coordinator) | High (compensation logic) | **Saga** - worth the complexity |
| **Failure Recovery** | Manual intervention | Self-healing | **Saga** - automatic recovery |
| **Network Partitions** | Blocks indefinitely | Continues operating | **Saga** - partition tolerance |
| **Development Time** | Faster (simpler) | Slower (more complex) | **Saga** - long-term investment |

### The Rare Cases for 2PC

```
class RareUseCasesFor2PC:
    """When 2PC might still be appropriate"""
    
    @staticmethod
    def financial_transfers():
        """Bank account transfers between different banks"""
        return {
            'use_case': 'Interbank money transfers',
            'why_2pc': 'Absolute consistency required - no partial transfers allowed',
            'constraints': 'Lower volume, can tolerate blocking',
            'example': 'Transfer $10,000 from Bank A to Bank B - must be atomic',
            'acceptable_trade_offs': 'Lower availability for perfect consistency'
        }
    
    @staticmethod
    def inventory_allocation():
        """Critical inventory allocation for limited items"""
        return {
            'use_case': 'Concert tickets, limited edition products',
            'why_2pc': 'Cannot oversell - inventory must be exactly tracked',
            'constraints': 'Short time windows, manageable scale',
            'example': '100 VIP tickets - ensure exactly 100 are sold',
            'acceptable_trade_offs': 'System slowdown during high demand'
        }
    
    @staticmethod
    def regulatory_compliance():
        """Operations requiring audit trails and exact consistency"""
        return {
            'use_case': 'Healthcare records, legal documents',
            'why_2pc': 'Regulatory requirements for atomic operations',
            'constraints': 'Lower volume, compliance over performance',
            'example': 'Medical procedure billing - all records must match exactly',
            'acceptable_trade_offs': 'Performance for compliance'
        }

# When Saga Patterns Shine
class SagaPatternAdvantages:
    """Why Saga patterns are ideal for most business scenarios"""
    
    @staticmethod
    def e_commerce_scenarios():
        """Online shopping, order processing"""
        return {
            'use_case': 'Order processing: payment + inventory + shipping',
            'why_saga': 'Can handle payment failures gracefully',
            'benefits': [
                'Immediate payment processing',
                'Inventory reserved but recoverable',
                'Shipping cancellable if needed'
            ],
            'real_world_example': 'Amazon order processing'
        }
    
    @staticmethod
    def travel_booking():
        """Flight + hotel + car booking"""
        return {
            'use_case': 'WonderTravel booking system',
            'why_saga': 'Services are independent, compensation natural',
            'benefits': [
                'Each service highly available',
                'Natural cancellation policies',
                'User-friendly partial failure handling'
            ],
            'real_world_example': 'Expedia, Booking.com'
        }
    
    @staticmethod
    def microservices_architectures():
        """Modern distributed systems"""
        return {
            'use_case': 'Any multi-service business process',
            'why_saga': 'Aligns with microservice independence',
            'benefits': [
                'Services evolve independently',
                'No coordinator bottleneck',
                'Resilient to service failures'
            ],
            'real_world_example': 'Netflix, Uber, Airbnb'
        }
```

### WonderTravel's Production Architecture Decision

```
class WonderTravelProductionDecision:
    """Final architecture chosen for WonderTravel"""
    
    def __init__(self):
        self.chosen_pattern = "Hybrid Saga Pattern"
        self.reasons = [
            "High availability requirements (99.99%)",
            "Global scale (50K+ concurrent bookings)",
            "Independent service evolution",
            "Natural compensation actions in travel domain",
            "Better user experience during failures"
        ]
    
    def production_implementation(self):
        """Production saga implementation strategy"""
        
        return {
            'pattern': 'Orchestrated Saga',
            'orchestrator': 'Dedicated saga orchestrator service',
            'event_store': 'Apache Kafka for event sourcing',
            'compensation_strategy': 'Automatic with manual fallback',
            'monitoring': 'Real-time saga state tracking',
            'recovery': 'Automatic retry with exponential backoff',
            
            'service_implementations': {
                'flight_service': {
                    'database': 'PostgreSQL with saga state table',
                    'idempotency': 'Redis-based distributed locks',
                    'compensation': 'Automatic cancellation with refund'
                },
                'hotel_service': {
                    'database': 'MongoDB with saga context',
                    'idempotency': 'Document-level versioning',
                    'compensation': 'Free cancellation policy'
                },
                'car_service': {
                    'database': 'MySQL with saga tracking',
                    'idempotency': 'Unique constraint on booking hash',
                    'compensation': 'Automated cancellation'
                }
            },
            
            'monitoring_metrics': [
                'Saga completion rate',
                'Compensation success rate',
                'Average saga duration',
                'Failed saga recovery time'
            ]
        }
    
    def business_impact_results(self):
        """Results after implementing Saga pattern"""
        
        return {
            'availability_improvement': '99.5% → 99.97%',
            'booking_success_rate': '94% → 99.2%',
            'peak_load_handling': '10K → 75K concurrent bookings',
            'customer_satisfaction': '3.2 → 4.7 stars',
            'revenue_impact': '$2.4M recovered from failed bookings',
            'operational_overhead': 'Reduced manual interventions by 85%'
        }

# Production monitoring and alerting
class SagaMonitoring:
    """Production monitoring for saga-based systems"""
    
    def __init__(self):
        self.metrics_collector = PrometheusMetrics()
        self.alert_manager = AlertManager()
    
    def define_saga_metrics(self):
        """Key metrics for saga health monitoring"""
        
        return {
            'saga_duration_histogram': 'Time from start to completion/compensation',
            'saga_success_rate': 'Percentage of sagas completing successfully',
            'compensation_success_rate': 'Percentage of compensations succeeding',
            'saga_step_failure_rate': 'Failure rate by individual step',
            'pending_sagas_gauge': 'Number of sagas currently in progress',
            'saga_recovery_time': 'Time to recover from saga failures'
        }
    
    def setup_alerting_rules(self):
        """Critical alerts for saga operations"""
        
        return {
            'saga_success_rate_low': {
                'condition': 'success_rate < 95%',
                'severity': 'critical',
                'action': 'Page on-call engineer'
            },
            'compensation_failure_spike': {
                'condition': 'compensation_failures > 10 in 5min',
                'severity': 'warning',
                'action': 'Investigate failing compensations'
            },
            'saga_duration_anomaly': {
                'condition': 'avg_duration > 3 × historical_avg',
                'severity': 'warning',
                'action': 'Check service health'
            },
            'pending_sagas_accumulation': {
                'condition': 'pending_sagas > 1000',
                'severity': 'critical',
                'action': 'Check for saga orchestrator issues'
            }
        }
```

---

## Advanced Patterns and Future Evolution

### Saga with Machine Learning Compensation

```
class IntelligentSagaCompensation:
    """AI-powered compensation strategies"""
    
    def __init__(self):
        self.ml_model = self._load_compensation_model()
        self.compensation_history = CompensationHistoryRepository()
    
    async def predict_optimal_compensation(self, saga_context: dict, failure_reason: str) -> dict:
        """Use ML to determine best compensation strategy"""
        
        features = self._extract_features(saga_context, failure_reason)
        
        # Predict best compensation approach
        compensation_scores = self.ml_model.predict_proba([features])
        
        strategies = [
            'immediate_full_refund',
            'voucher_compensation',
            'alternative_booking',
            'partial_compensation',
            'manual_review_required'
        ]
        
        best_strategy = strategies[compensation_scores.argmax()]
        confidence = compensation_scores.max()
        
        return {
            'recommended_strategy': best_strategy,
            'confidence': confidence,
            'alternative_strategies': [
                {'strategy': strategies[i], 'score': score}
                for i, score in enumerate(compensation_scores) 
                if i != compensation_scores.argmax()
            ]
        }
    
    def _extract_features(self, saga_context: dict, failure_reason: str) -> List[float]:
        """Extract features for ML model"""
        
        return [
            saga_context.get('customer_tier', 0),  # VIP, Gold, Silver, Bronze
            saga_context.get('booking_value', 0),   # Total booking amount
            saga_context.get('advance_booking_days', 0),  # How far in advance
            saga_context.get('failure_step', 0),    # Which step failed
            saga_context.get('historical_cancellations', 0),  # Customer history
            len(failure_reason),  # Complexity of failure
            saga_context.get('seasonal_demand', 0),  # High/low season
        ]

class EventSourcingSaga:
    """Saga with complete event sourcing for auditability"""
    
    def __init__(self):
        self.event_store = EventStore()
        self.saga_projector = SagaStateProjector()
    
    async def execute_saga_with_event_sourcing(self, saga_id: str, booking_request: dict):
        """Execute saga with complete event history"""
        
        # Start saga
        await self._emit_event(saga_id, 'SagaStarted', booking_request)
        
        # Reconstruct current state from events
        current_state = await self._rebuild_saga_state_from_events(saga_id)
        
        # Execute next step based on current state
        next_step = self._determine_next_step(current_state)
        
        if next_step:
            await self._execute_saga_step(saga_id, next_step, current_state)
    
    async def _rebuild_saga_state_from_events(self, saga_id: str) -> dict:
        """Rebuild saga state by replaying all events"""
        
        events = await self.event_store.get_events_for_saga(saga_id)
        
        state = {}
        for event in events:
            state = self.saga_projector.apply_event(state, event)
        
        return state
    
    async def _emit_event(self, saga_id: str, event_type: str, event_ dict):
        """Emit saga event to event store"""
        
        event = {
            'saga_id': saga_id,
            'event_type': event_type,
            'event_data': event_data,
            'timestamp': time.time(),
            'sequence_number': await self._get_next_sequence_number(saga_id)
        }
        
        await self.event_store.append_event(event)
        
        # Also publish to event bus for real-time processing
        await self.event_bus.publish(event)
```

---

## Summary: The Distributed Transaction Revolution

The journey from Two-Phase Commit to Saga Pattern represents more than a technical migration—it's a fundamental shift in how we think about distributed systems, consistency, and user experience.

**The Technical Transformation:**
- **From blocking to non-blocking**: 2PC's coordinator bottleneck eliminated
- **From strong to eventual consistency**: Trading immediate consistency for availability
- **From centralized to distributed resilience**: Each service handles its own failures
- **From manual to automatic recovery**: Self-healing through compensation

**The Business Impact:**
- **Availability**: 99.5% → 99.97% uptime (from hours to minutes of downtime)
- **Scale**: 10K → 75K concurrent bookings handled seamlessly
- **Customer satisfaction**: 3.2 → 4.7 stars through better failure handling
- **Revenue recovery**: $2.4M in previously failed bookings now successful

**The Architectural Wisdom:**
- **Embrace eventual consistency**: Most business processes can tolerate brief inconsistency
- **Design for failure**: Compensation actions should be first-class citizens
- **Choose based on context**: 2PC has rare but valid use cases (banking, compliance)
- **Monitor saga health**: Success rates, compensation patterns, and recovery times

**The Universal Lessons:**

1. **Distributed systems require different thinking**: What works in monoliths fails at scale
2. **Business requirements drive architecture**: Travel booking tolerates eventual consistency, banking does not
3. **Operational complexity is worth business resilience**: Saga's complexity pays dividends in reliability
4. **Recovery is as important as the happy path**: Design compensation actions with the same care as primary actions

As WonderTravel's customers now book their dream vacations without fear of partial failures, and the system gracefully handles everything from network partitions to service crashes, the Saga pattern proves that sometimes the most robust solutions come not from preventing failures, but from embracing them and building systems that heal themselves.

The next time you face a distributed transaction challenge, remember: perfect consistency is the enemy of high availability. Sometimes the best way to ensure everything works is to accept that sometimes things fail—and build systems that know how to fix themselves.

**The Final Truth:** In distributed systems, it's not about avoiding failures—it's about failing gracefully and recovering automatically. Saga patterns don't eliminate the complexity of distributed transactions; they make that complexity manageable, observable, and ultimately, reliable at scale.
