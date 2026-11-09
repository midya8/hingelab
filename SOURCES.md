# Source and attribution notes

Reviewed November 9, 2026. This project is an original bounded educational implementation of established piecewise-affine network analysis. No source code was imported from these papers or their systems. The Chrome readiness helper is reused from the same portfolio's MIT-licensed WarpLab test infrastructure; it is test setup, not a verifier.

## Used mathematical grounding

1. Matthew Sotoudeh and Aditya V. Thakur, *Computing Linear Restrictions of Neural Networks*, NeurIPS 2019. Primary paper.
   https://proceedings.neurips.cc/paper_files/paper/2019/file/908075ea2c025c335f4865f7db427062-Paper.pdf
   Establishes exact line partitions on which a piecewise-linear network is affine, and splitting at ReLU coordinate roots. HingeLab restricts to one scalar input and at most two small fully connected ReLU layers. It does not reproduce the paper's broader layer support, ACAS Xu results, integrated-gradient experiments or implementation performance.

2. Rudy Bunel, Jingyue Lu, Ilker Turkaslan, Philip H.S. Torr, Pushmeet Kohli and M. Pawan Kumar, *Branch and Bound for Piecewise Linear Neural Network Verification*, JMLR 21(42), 2020. Primary journal page.
   https://www.jmlr.org/papers/v21/19-468.html
   Background for neural-network property verification and piecewise-linear reasoning. HingeLab uses complete tiny activation-mask enumeration, not this full branch-and-bound system.

## Cross-checks and broader background

3. *Traversing the Local Polytopes of ReLU Neural Networks: A Unified Approach for Network Verification*, arXiv 2111.08922v2. Primary manuscript.
   https://arxiv.org/html/2111.08922v2
   Confirms the activation-pattern polytope view and local affine forms. HingeLab neither claims nor implements the paper's multidimensional adjacency traversal.

4. *Formal Verification of Piece-Wise Linear Feed-Forward Neural Networks*, arXiv 1705.01320v3. Primary manuscript.
   https://arxiv.org/pdf/1705.01320v3
   Background on phase-based verification and the difficulty of larger networks. No claim that this tiny exhaustive checker replaces general verifiers.

5. *Fast Geometric Projections for Local Robustness Certification*, author-hosted paper. Primary manuscript; publication date not used.
   https://www.contrib.andrew.cmu.edu/~bparno/papers/fgp.pdf
   Background on activation regions, decision boundaries and local robustness. HingeLab does not use geometric projections or claim its guarantees for multidimensional inputs.

6. László Antal, Hana Masara and Erika Ábrahám, *Extending Neural Network Verification to a Larger Family of Piece-wise Linear Activation Functions*, arXiv 2311.10780. Primary manuscript mirror.
   https://ar5iv.labs.arxiv.org/html/2311.10780
   Cross-check for phase splitting and exact set propagation. HingeLab supports ReLU only, not the larger family in this work.

## Local claims, not borrowed results

The classifier's class-1 tie convention, domain-restricted opposite-class sets, attained minimum versus open-set infimum, and closed-ball verdict are defined explicitly in CONTRACT.md and checked by exact rational interval topology. A paper's different tie convention is not silently imported. The maximum absolute output slope is the least Lipschitz constant of this continuous scalar piecewise-affine function on its declared interval. No learned-model accuracy, runtime benchmark, new-algorithm result or broader formal-verification guarantee is claimed.

## Reference-atlas extension

- H.J.A.M. Heijmans, *Mathematical Morphology: an Algebraic Approach*, CWI primary paper, §1.2. https://ir.cwi.nl/pub/2430/2430D.pdf . Erosion is containment of a translated structuring element. Used for established set-erosion attribution, not the paper's complete-lattice results.
- Wesley Pegden, *Sets resilient to erosion*, primary manuscript. https://ar5iv.labs.arxiv.org/html/1101.4416 . Its definition uses open balls and distance ≥ r, unlike our closed perturbation balls and mixed endpoint class sets. Used to make convention differences explicit, not to claim its resilience theorems apply.
