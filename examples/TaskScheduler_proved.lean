def Time := Nat

structure Job where
  deadline : Time
  cost : Time

def completed (service cost : Nat) : Prop := service ≥ cost

theorem completed_refl : ∀ c, completed c c := by
  intro c
  unfold completed
  exact Nat.le_refl c

theorem completed_grow : ∀ s c, completed s c → completed (s + 1) c := by
  intro s c h
  unfold completed at *
  omega

theorem zero_cost_done : ∀ s, completed s 0 := by
  intro s
  unfold completed
  omega
