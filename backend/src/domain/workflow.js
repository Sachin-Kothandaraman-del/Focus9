// ---------------------------------------------------------------------------
// EGA End-to-End Distribution workflow (from the flow-chart PPTX).
//
//   Material Request
//        -> Receipt Acknowledgement
//        -> (Material Return branch, optional)
//        -> SO Creation                (Focus 9)
//        -> Delivery Note              ("Delivery to the person")
//        -> Within Allocated Qtys?  --No-->  EGA Approval (Yes/No)
//        -> Delivery Note Consolidation
//        -> Invoice to EGA             (Focus 9)
//
// The "Within Allocated Qtys" gate decides whether EGA Approval is required:
// requests within a recipient's allocation flow straight through; requests that
// exceed allocation are routed to an EGA approver.
// ---------------------------------------------------------------------------

export const STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED', // Material Request raised
  ACKNOWLEDGED: 'ACKNOWLEDGED', // Receipt Acknowledgement
  PENDING_APPROVAL: 'PENDING_APPROVAL', // exceeded allocation -> EGA Approval
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SO_CREATED: 'SO_CREATED', // Sales Order created in Focus 9
  DELIVERED: 'DELIVERED', // Delivery Note issued to the person
  CONSOLIDATED: 'CONSOLIDATED', // Delivery Note Consolidation
  INVOICED: 'INVOICED', // Invoice to EGA
  CANCELLED: 'CANCELLED',
};

// Human-readable next-step hint for the UI timeline.
export const NEXT_STEP = {
  DRAFT: 'Submit the material request',
  SUBMITTED: 'Awaiting receipt acknowledgement by stores',
  ACKNOWLEDGED: 'Allocation check / EGA approval',
  PENDING_APPROVAL: 'Awaiting EGA approval (exceeds allocation)',
  APPROVED: 'Create Sales Order in Focus 9',
  REJECTED: 'Request rejected by EGA approver',
  SO_CREATED: 'Issue Delivery Note (delivery to the person)',
  DELIVERED: 'Consolidate delivery notes',
  CONSOLIDATED: 'Raise invoice to EGA',
  INVOICED: 'Completed',
  CANCELLED: 'Cancelled',
};

// Allowed forward transitions (guards enforced in routes).
const TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['PENDING_APPROVAL', 'APPROVED', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['SO_CREATED'],
  SO_CREATED: ['DELIVERED'],
  DELIVERED: ['CONSOLIDATED'],
  CONSOLIDATED: ['INVOICED'],
  INVOICED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** Append an immutable timeline entry to a request. */
export function pushHistory(request, status, actor, note) {
  request.history = request.history || [];
  request.history.push({
    status,
    note: note || NEXT_STEP[status] || '',
    by: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
    at: new Date().toISOString(),
  });
  request.status = status;
  request.nextStep = NEXT_STEP[status];
}

/**
 * The "Within Allocated Qtys" decision.
 * @returns {{ within: boolean, exceeded: Array }}
 */
export function evaluateAllocation(lines, materialsById) {
  const exceeded = [];
  for (const line of lines) {
    const mat = materialsById[line.materialId];
    if (!mat) continue;
    if (line.qty > mat.allocatedQty) {
      exceeded.push({
        materialId: mat.id,
        materialName: mat.name,
        requested: line.qty,
        allocated: mat.allocatedQty,
        over: line.qty - mat.allocatedQty,
      });
    }
  }
  return { within: exceeded.length === 0, exceeded };
}
