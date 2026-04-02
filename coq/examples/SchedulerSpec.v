(* Task Scheduler with Deadline Guarantees *)

From Stdlib Require Import Arith.
From Stdlib Require Import Lia.

Definition Time := nat.

Record Job := mkJob {
  release : Time;
  deadline : Time;
  cost : Time
}.

Definition Schedule := Time -> option Job.

(* Service: how much work a job has received by time t *)
Fixpoint service (sched : Schedule) (j : Job) (t : Time) : nat :=
  match t with
  | 0 => 0
  | S t' => service sched j t' +
      match sched t' with
      | Some j' => if Nat.eqb (deadline j') (deadline j) then 1 else 0
      | None => 0
      end
  end.

(* A job is completed when service >= cost *)
Definition completed_by (sched : Schedule) (j : Job) (t : Time) : Prop :=
  service sched j t >= cost j.

(* A job meets its deadline if completed by deadline time *)
Definition meets_deadline (sched : Schedule) (j : Job) : Prop :=
  completed_by sched j (deadline j).

(* THEOREM 1: Service at time 0 is always 0 *)
Theorem service_zero : forall sched j, service sched j 0 = 0

(* THEOREM 2: Service is monotonically non-decreasing (one step) *)
Theorem service_mono : forall sched j t, service sched j t <= service sched j (S t)
