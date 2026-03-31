Require Import Coq.Arith.Arith.
Require Import Coq.Lists.List.
Import ListNotations.

Definition time := nat.

Record Job := mkJob {
  deadline : time;
  cost     : time;
}.

Definition completed (service cost : nat) := service >= cost.

Theorem completed_refl : forall c, completed c c.

Theorem completed_grow : forall s c, completed s c -> completed (S s) c.

Theorem zero_cost_done : forall s, completed s 0.
