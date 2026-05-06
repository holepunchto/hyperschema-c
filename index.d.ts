declare class CHyperschema {
  toCode(): { header: string; source: string }

  static from(dir: string): CHyperschema
  static toDisk(hyperschema: CHyperschema, dir?: string | null): void
}

export = CHyperschema
