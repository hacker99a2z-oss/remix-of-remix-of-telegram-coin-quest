type PagesRequestContext = {
  request: Request;
  env: { API: { fetch(request: Request): Promise<Response> } };
};

export const onRequest = ({ request, env }: PagesRequestContext) => {
  return env.API.fetch(request);
};
