import { handleApi, type Env } from '../../server/api';
export const onRequest: PagesFunction<Env> = (context) => handleApi(context.request, context.env);
