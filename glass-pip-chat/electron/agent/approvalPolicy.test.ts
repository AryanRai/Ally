// @vitest-environment node
import {expect,it} from 'vitest';
import {codexApprovalPolicy} from './approvalPolicy';
it('full access permits user approval requests rather than rejecting prompt categories',()=>{
  expect(codexApprovalPolicy('full')).toEqual({approvalPolicy:'on-request',approvalsReviewer:'user'});
  expect(codexApprovalPolicy('readonly')).toEqual({approvalPolicy:'on-request',approvalsReviewer:'user'});
  expect(codexApprovalPolicy('full',false)).toEqual({approvalPolicy:'never'});
});

