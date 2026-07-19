export default async function authenticate(fastify) {
  fastify.decorate("authenticate", async function (req, reply) {
    try {
      await req.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: "Token inválido ou expirado" });
    }
  });
}
