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
Proof.
  intros c. unfold completed. apply Nat.le_refl.
Qed.

Theorem completed_grow : forall s c, completed s c -> completed (S s) c.
Proof.
  unfold completed. intros s c H. unfold ge in *. apply le_S. exact H.
Qed.

Theorem zero_cost_done : forall s, completed s 0.
Proof.
  intro s. unfold completed. apply Nat.le_0_l.
Qed.
