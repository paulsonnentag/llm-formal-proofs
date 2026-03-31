(* Simple theorems to validate the proof generation pipeline *)

Require Import Coq.Arith.Arith.
Require Import Coq.Lists.List.
Import ListNotations.

Theorem identity : forall (P : Prop), P -> P.
Proof.
  intros P H.
  exact H.
Qed.

Theorem plus_0_r : forall n : nat, n + 0 = n.
Proof.
  induction n as [| n' IHn'].
  - simpl. reflexivity.
  - simpl. rewrite IHn'. reflexivity.
Qed.

Theorem plus_comm_S : forall n m : nat, S (n + m) = n + S m.
Proof.
  induction n as [| n' IHn'].
  - intro m. simpl. reflexivity.
  - intro m. simpl. rewrite IHn'. reflexivity.
Qed.

Theorem app_nil_r : forall (A : Type) (l : list A), l ++ [] = l.
Proof.
  intros A l.
  induction l as [| h t IHt].
  - simpl. reflexivity.
  - simpl. rewrite IHt. reflexivity.
Qed.