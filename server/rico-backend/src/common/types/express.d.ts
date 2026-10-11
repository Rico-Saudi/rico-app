import { CustomerDocument } from '../../customers/schemas/customer.schema';

// Set by CustomerAuthGuard/OptionalCustomerAuthGuard after a bearer token
// resolves. Distinct from req.session.accountId (the dashboards' cookie
// session) — an app customer is never an Account and must never satisfy a
// dashboard guard.
declare global {
  namespace Express {
    interface Request {
      customer?: CustomerDocument;
      customerToken?: string;
    }
  }
}

export {};
