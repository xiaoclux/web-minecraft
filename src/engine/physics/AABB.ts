/** 轴对齐包围盒。 */
export class AABB {
  constructor(
    public minX: number,
    public minY: number,
    public minZ: number,
    public maxX: number,
    public maxY: number,
    public maxZ: number,
  ) {}

  /** 以脚底中心创建实体包围盒。 */
  static fromFeet(x: number, y: number, z: number, width: number, height: number): AABB {
    const half = width / 2;
    return new AABB(x - half, y, z - half, x + half, y + height, z + half);
  }

  /** 是否相交。 */
  intersects(other: AABB): boolean {
    return (
      this.minX < other.maxX &&
      this.maxX > other.minX &&
      this.minY < other.maxY &&
      this.maxY > other.minY &&
      this.minZ < other.maxZ &&
      this.maxZ > other.minZ
    );
  }

  /** 平移后的新盒。 */
  offset(dx: number, dy: number, dz: number): AABB {
    return new AABB(this.minX + dx, this.minY + dy, this.minZ + dz, this.maxX + dx, this.maxY + dy, this.maxZ + dz);
  }

  /** 扩展（负值表示收缩）。 */
  expand(dx: number, dy: number, dz: number): AABB {
    return new AABB(this.minX - dx, this.minY - dy, this.minZ - dz, this.maxX + dx, this.maxY + dy, this.maxZ + dz);
  }

  /** 中心点。 */
  center(): [number, number, number] {
    return [(this.minX + this.maxX) / 2, (this.minY + this.maxY) / 2, (this.minZ + this.maxZ) / 2];
  }
}
