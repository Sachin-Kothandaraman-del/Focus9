// PROSAFE connector.
//
// In the EGA flow chart the middleware sits between the EGA Server and the
// PROSAFE Server. PROSAFE is EGA's personnel / safety-equipment system of
// record; here it validates that the person receiving material is a valid EGA
// employee and exposes their allocation entitlement.
//
// Mock mode returns deterministic data so the "within allocated qty" decision
// in the flow chart can be exercised without the external system.
import { config } from '../config.js';

const mockEmployees = {
  EGA1001: { name: 'Ahmed Al Mansoori', dept: 'Pot Line 1', active: true },
  EGA1002: { name: 'Rashid Khan', dept: 'Casthouse', active: true },
  EGA1003: { name: 'Mariam Saeed', dept: 'Carbon Plant', active: true },
  EGA1004: { name: 'John Mathew', dept: 'Maintenance', active: true },
};

export const prosafe = {
  mode: config.prosafe.mode,

  async validateEmployee(employeeId) {
    if (config.prosafe.mode === 'live') {
      const res = await fetch(`${config.prosafe.baseUrl}/employees/${employeeId}`, {
        headers: { Authorization: `Bearer ${config.prosafe.apiKey}` },
      });
      if (!res.ok) return { valid: false };
      const e = await res.json();
      return { valid: !!e.active, employee: e };
    }
    const e = mockEmployees[employeeId];
    return e ? { valid: e.active, employee: { id: employeeId, ...e } } : { valid: false };
  },
};

export const KNOWN_EMPLOYEES = mockEmployees;
