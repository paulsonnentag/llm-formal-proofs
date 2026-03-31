-- Task Scheduler with Deadline Guarantees

abbrev Time := Nat

structure Job where
  release : Time
  deadline : Time
  cost : Time

def Schedule := Time → Option Job

-- Service: how much work a job has received by time t
def service (sched : Schedule) (j : Job) : Time → Nat
  | 0 => 0
  | t + 1 => service sched j t +
      match sched t with
      | some j' => if j'.deadline = j.deadline then 1 else 0
      | none => 0

-- A job is completed when service >= cost
def completed_by (sched : Schedule) (j : Job) (t : Time) : Prop :=
  service sched j t ≥ j.cost

-- A job meets its deadline if completed by deadline time
def meets_deadline (sched : Schedule) (j : Job) : Prop :=
  completed_by sched j j.deadline

-- THEOREM 1: Service at time 0 is always 0
theorem service_zero : ∀ sched j, service sched j 0 = 0

-- THEOREM 2: Service is monotonically non-decreasing (one step)
theorem service_mono : ∀ sched j t, service sched j t ≤ service sched j (t + 1)
