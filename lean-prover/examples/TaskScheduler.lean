def Time := Nat

structure Job where
  deadline : Time
  cost : Time

def completed (service cost : Nat) : Prop := service ≥ cost

theorem completed_refl : ∀ c, completed c c

theorem completed_grow : ∀ s c, completed s c → completed (s + 1) c

theorem zero_cost_done : ∀ s, completed s 0
