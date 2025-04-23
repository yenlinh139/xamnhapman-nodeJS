const CreateFarmBoundary = async (req, res, next) => {
  const {geometry, email} = req.body;

  if (!email) {
    return res.status(400).json({error: "Email is required to save the boundary."});
  }

  if (!geometry || !geometry.startsWith("POLYGON")) {
    return res.status(400).json({error: "Invalid geometry data."});
  }

  try {
    const sql = `
      INSERT INTO map_regions (email, geometry, created_at)
      VALUES ($1, ST_GeomFromText($2, 4326), NOW())
      RETURNING *;
    `;
    const values = [email, geometry];

    const result = await client.query(sql, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error saving data:", err);
    res.status(500).json({error: "Failed to save boundary data."});
  }
};

module.exports = {CreateFarmBoundary};
