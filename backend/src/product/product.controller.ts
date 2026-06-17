import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { CategoryFiltersQueryDto } from './dto/category-filters-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  ProductDetailResponse,
  ProductFiltersResponse,
  ProductListResponse,
} from './types/product.types';

/**
 * Product browsing endpoints. Controllers stay thin: they validate input (DTOs
 * + the global pipe) and delegate to {@link ProductService}.
 *
 * The whole app is protected, so every route requires a valid session
 * (`JwtAuthGuard`) and the service re-checks `is_active` before any DB access.
 *
 * Route order matters — the specific `detail/:slug` and `:category/filters`
 * routes are declared **before** the `:category` listing route so they are not
 * swallowed by it.
 */
@Controller('product')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('detail/:slug')
  getProductDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<ProductDetailResponse> {
    return this.productService.getProductDetail(user.id, slug);
  }

  @Get(':category/filters')
  getCategoryFilters(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category') category: string,
    @Query() query: CategoryFiltersQueryDto,
  ): Promise<ProductFiltersResponse> {
    return this.productService.getCategoryFilters(
      user.id,
      category,
      query.search,
    );
  }

  @Get(':category')
  listProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category') category: string,
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductListResponse> {
    return this.productService.listProducts(user.id, category, query);
  }
}
