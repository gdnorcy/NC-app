// 省市区三级联动数据（示例数据，覆盖主流省份；生产环境应替换为完整行政区数据集）
// 结构：{ 省: { 市: [区...] } }
export const REGION_DATA = {
  北京市: { 北京市: ['东城区', '西城区', '朝阳区', '海淀区', '丰台区'] },
  上海市: { 上海市: ['黄浦区', '徐汇区', '长宁区', '静安区', '浦东新区'] },
  广东省: {
    广州市: ['天河区', '越秀区', '海珠区', '白云区'],
    深圳市: ['南山区', '福田区', '罗湖区', '宝安区'],
    珠海市: ['香洲区', '金湾区'],
  },
  浙江省: {
    杭州市: ['上城区', '拱墅区', '西湖区', '滨江区'],
    宁波市: ['海曙区', '江北区', '鄞州区'],
  },
  江苏省: {
    南京市: ['玄武区', '秦淮区', '鼓楼区', '江宁区'],
    苏州市: ['姑苏区', '吴中区', '工业园区'],
  },
};

export const regionProvinces = Object.keys(REGION_DATA);
export function regionCities(province) {
  return province && REGION_DATA[province] ? Object.keys(REGION_DATA[province]) : [];
}
export function regionDistricts(province, city) {
  return province && city && REGION_DATA[province] && REGION_DATA[province][city]
    ? REGION_DATA[province][city]
    : [];
}

export const dateYears = Array.from({ length: 16 }, (_, i) => 2020 + i);
export function dateDays(year, month) {
  if (!year || !month) return [];
  const m = Number(month);
  const y = Number(year);
  if (m === 2) return Array.from({ length: (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28 }, (_, i) => i + 1);
  if ([4, 6, 9, 11].includes(m)) return Array.from({ length: 30 }, (_, i) => i + 1);
  return Array.from({ length: 31 }, (_, i) => i + 1);
}
