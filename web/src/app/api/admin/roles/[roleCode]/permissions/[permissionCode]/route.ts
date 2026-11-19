import { setPermission } from '../../../../../../../server/authorization';
type Context = {
  params: Promise<{ roleCode: string; permissionCode: string }>;
};
export function PUT(request: Request, context: Context) {
  return setPermission(request, context, true);
}
export function DELETE(request: Request, context: Context) {
  return setPermission(request, context, false);
}
