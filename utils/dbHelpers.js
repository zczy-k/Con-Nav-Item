const db = require('../db');

/**
 * 分页查询辅助函数
 * @param {string} table - 表名
 * @param {object} options - 查询选项
 */
async function paginateQuery(table, options = {}) {
  const {
    page,
    pageSize,
    orderBy = 'id',
    where = '',
    whereParams = [],
    select = '*'
  } = options;

  try {
    if (!page && !pageSize) {
      const query = `SELECT ${select} FROM ${table}${where ? ' WHERE ' + where : ''} ORDER BY ${orderBy}`;
      return await db.all(query, whereParams);
    } else {
      const pageNum = parseInt(page) || 1;
      const size = parseInt(pageSize) || 10;
      const offset = (pageNum - 1) * size;

      const countQuery = `SELECT COUNT(*) as total FROM ${table}${where ? ' WHERE ' + where : ''}`;
      const countRow = await db.get(countQuery, whereParams);

      const dataQuery = `SELECT ${select} FROM ${table}${where ? ' WHERE ' + where : ''} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      const rows = await db.all(dataQuery, [...whereParams, size, offset]);

      return {
        total: countRow.total,
        page: pageNum,
        pageSize: size,
        data: rows
      };
    }
  } catch (err) {
    throw err;
  }
}

function handleError(res, error, message = '操作失败') {
  res.status(500).json({ error: message, details: error.message });
}

module.exports = {
  paginateQuery,
  handleError
};
