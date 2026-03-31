(* Simple theorems to validate the proof generation pipeline *)

Require Import Coq.Arith.Arith.
Require Import Coq.Lists.List.
Import ListNotations.

Theorem identity : forall (P : Prop), P -> P.

Theorem plus_0_r : forall n : nat, n + 0 = n.

Theorem plus_comm_S : forall n m : nat, S (n + m) = n + S m.

Theorem app_nil_r : forall (A : Type) (l : list A), l ++ [] = l.
