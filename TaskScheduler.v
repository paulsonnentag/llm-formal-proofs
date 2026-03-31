(* Task Scheduler with Deadline Guarantees — Sketch *)

Require Import Coq.Arith.Arith.
Require Import Coq.Lists.List.
Import ListNotations.

Definition time := nat.

Record Job := mkJob {
  release  : time;
  deadline : time;
  cost     : time;
}.

Definition schedule := time -> option Job.

Fixpoint service (sched : schedule) (j : Job) (t : time) : nat :=
  match t with
  | 0   => 0
  | S t' =>
      service sched j t' +
      match sched t' with
      | Some j' => if Nat.eqb (deadline j') (deadline j) then 1 else 0
      | None    => 0
      end
  end.

Definition completed_by sched j t := service sched j t >= cost j.
Definition meets_deadline sched j  := completed_by sched j (deadline j).

Definition edf sched :=
  forall t j1 j2,
    sched t = Some j1 ->
    ~ completed_by sched j2 t ->
    t >= release j2 ->
    deadline j1 <= deadline j2.

Definition feasible jobs :=
  exists sched, forall j, In j jobs -> meets_deadline sched j.

(* If any schedule meets all deadlines, so does EDF. *)
Theorem edf_optimal :
  forall jobs,
    feasible jobs ->
    exists sched, edf sched /\ forall j, In j jobs -> meets_deadline sched j.
Proof. Admitted.

(* Once done, stays done. *)
Theorem completion_stable :
  forall sched j t1 t2,
    t1 <= t2 -> completed_by sched j t1 -> completed_by sched j t2.
Proof. Admitted.

(* Under EDF, idle means nothing left to do. *)
Theorem edf_idle_all_done :
  forall sched jobs t,
    edf sched -> feasible jobs ->
    sched t = None ->
    forall j, In j jobs -> release j <= t -> completed_by sched j t.
Proof. Admitted.
