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
theorem service_zero : ∀ sched j, service sched j 0 = 0 := by
  intros sched j
  rfl

-- THEOREM 2: Service is monotonically non-decreasing (one step)
theorem service_mono : ∀ sched j t, service sched j t ≤ service sched j (t + 1) := by
  intros sched j t
  simp only [service]
  apply Nat.le_add_right

-- THEOREM 3: Service grows over any time interval
theorem service_le_of_le : ∀ sched j t1 t2, t1 ≤ t2 → service sched j t1 ≤ service sched j t2 := by
  intros sched j t1 t2 h
  induction t2 with
  | zero =>
    simp only [Nat.le_zero] at h
    subst h
    exact Nat.le_refl _
  | succ t2 ih =>
    cases Nat.lt_or_eq_of_le h with
    | inl hlt =>
      have h' : t1 ≤ t2 := Nat.lt_succ_iff.mp hlt
      exact Nat.le_trans (ih h') (service_mono sched j t2)
    | inr heq =>
      subst heq
      exact Nat.le_refl _

-- THEOREM 4: Once completed, stays completed (the deadline guarantee!)
theorem completion_stable : ∀ sched j t1 t2,
  t1 ≤ t2 → completed_by sched j t1 → completed_by sched j t2 := by
  intros sched j t1 t2 hle hcomp
  unfold completed_by at *
  exact Nat.le_trans hcomp (service_le_of_le sched j t1 t2 hle)
